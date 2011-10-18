/*
 * Copyright JSC Metahouse
 * 09.09.2011 22:39
 * minchenkov
 */


var DomJS = require("dom-js-ns").DomJS;
var fs = require('fs');
var util = require('util');
var XmlWriter = require('simple-xml-writer').XmlWriter;
var http = require('http');
var url = require('url');
var request = require('request');


var domjs = new DomJS();

function SoapClient(clientOptions) {
    this.clientOptions = clientOptions;
}

SoapClient.prototype.init = function(soapCallback) {
    var clientOptions = this.clientOptions;
    if (!clientOptions.wsdl) {
        if (!clientOptions.endpoint)
            throw new Error('wsdl or endpoint should be specified');
        else
            clientOptions.wsdl = clientOptions.endpoint + '?wsdl'
    }

    var types = {};
    var jsdom = new DomJS();
    var namespaceObject = {};

    var WSDL_SCHEMA = 'http://schemas.xmlsoap.org/wsdl/';
    var XS_SCHEMA = 'http://www.w3.org/2001/XMLSchema';
    var SOAP_SCHEMA = 'http://schemas.xmlsoap.org/wsdl/soap/';
    var ENVELOPE_SCHEMA = 'http://schemas.xmlsoap.org/soap/envelope/';


    function getRequestOptions(httpOptions) {
        httpOptions.headers = {
            'Content-Type': 'text/xml;charset=UTF-8'
        };

        var authorization = clientOptions.authorization;
        if (authorization) {
            if (authorization.type == 'Basic') {
                httpOptions.headers.Authorization = 'Basic ' + new Buffer(authorization.userName + ':' + authorization.password).toString('base64');
            }
            else
                throw new Error('Unsupported authorization type');
        }
        return httpOptions;
    }

    function BaseType() {
    }

    BaseType.prototype._properties = [];

    function BaseSimpleType() {
    }

    util.inherits(BaseSimpleType, BaseType);
    BaseSimpleType.prototype.isSimpleType = true;
    BaseSimpleType.prototype.serialize = function(el, at, text) {
        text(this.value)
    };
    BaseSimpleType.prototype.deserialize = function(dom) {
        return dom.text();
    };


    function BaseComplexType() {
    }

    util.inherits(BaseComplexType, BaseType);

    BaseComplexType.prototype.isSimpleType = false;
    BaseComplexType.prototype.serialize = function(el, at, text) {
        var hierarchy = getTypeHierarchy(this._type);
        var self = this;

        hierarchy.forEach(function(type) {
            type.prototype._properties.forEach(function(prop) {
                var propVal = self[prop.name];
                if (propVal) {
                    if (!prop.isArray) {
                        el(prop.name, function(el, at, text) {
                            propVal.serialize(el, at, text);
                        })
                    }
                    else {
                        propVal.forEach(function(pv) {
                            el(prop.name, function(el, at, text) {
                                pv.serialize(el, at, text);
                            })
                        });
                    }
                }
            });
        });
    };

    BaseComplexType.prototype.deserialize = function(dom) {
        var hierarchy = getTypeHierarchy(this._type);
        var self = this;

        hierarchy.forEach(function(type) {
            type.prototype._properties.forEach(function(prop) {
                if (!prop.isArray) {
                    dom.children.forEach(function(child) {
                        if (child.name == prop.name) {
                            var propInstance = new prop.type();
                            self[prop.name] = propInstance.deserialize(child);
                        }
                    });
                }
                else {
                    var propValue = null;
                    dom.children.forEach(function(child) {
                        if (child.name == prop.name) {
                            if (!propValue)
                                propValue = [];

                            var propInstance = new prop.type();
                            propValue.push(propInstance.deserialize(child));
                        }
                    });

                    if (propValue)
                        self[prop.name] = propValue;
                }
            });
        });
        return this;
    };


    function createType(options) {
        var type = function(arg) {
            if (arg) {
                for (var prop in arg)
                    this[prop] = arg[prop];
            }
        };

        if (!types[options.namespace])
            types[options.namespace] = {};

        types[options.namespace][options.name] = type;

        namespaceObject[options.name.substring(0, 1).toUpperCase() + options.name.substring(1)] = type;

        util.inherits(type, options.baseType);
        type.prototype._type = type;
        type.prototype._parent = options.baseType;
        type.prototype._typeName = options.name;
        type.prototype._properties = [];
        type.prototype._namespace = options.namespace;

        return type;
    }

    function createXsType(name, overrides) {
        var type = createType({name: name, namespace: XS_SCHEMA, baseType: BaseSimpleType});
        if (overrides) {
            for (var override in overrides) {
                type.prototype[override] = overrides[override];
            }
        }
        return type;
    }

    function getTypeHierarchy(type) {
        var hierarchy = [];
        var current = type;
        while (current != null) {
            hierarchy.push(current);
            current = current.prototype._parent;
        }

        hierarchy.reverse();
        return hierarchy;
    }

    createXsType('string');
    createXsType('dateTime', { deserialize: function(dom) {
        return new Date(dom.text());
    }});
    createXsType('double', { deserialize: function(dom) {
        return parseFloat(dom.text());
    }});
    createXsType('boolean', { deserialize: function(dom) {
        var text = dom.text() || '';
        return !!text.match(/true/i);
    }});
    createXsType('int', { deserialize: function(dom) {
        return parseInt(dom.text());
    }});
    createXsType('long', { deserialize: function(dom) {
        return parseInt(dom.text());
    }});

    function reInitObject(originalObject, type) {
        var obj = new type();

        if (type.prototype.isSimpleType) {
            obj.value = originalObject;
        }
        else {
            for (var prop in originalObject)
                obj[prop] = originalObject[prop];
        }

        type.prototype._properties.forEach(function(prop) {
            var propValue = obj[prop.name];
            if (propValue != null) {
                if (!prop.isArray) {
                    propValue = reInitObject(propValue, prop.type);
                    obj[prop.name] = propValue;
                }
                else {
                    var newArray = [];

                    propValue.forEach(function(pv) {
                        newArray.push(reInitObject(pv, prop.type));
                    });

                    obj[prop.name] = newArray;
                }
            }
        });

        return obj;
    }

    function invokeMethod(methodName, arguments, inputType, outputType, endpoint) {
        if (!arguments.length)
            throw new Error('Missing callback argument');

        var callback = arguments[arguments.length - 1];
        if (typeof(callback) != 'function')
            throw new Error('Invalid callback function');

        var args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);

        var requestObject = {};
        var index = 0;

        inputType.prototype._properties.forEach(function(prop) {
            requestObject[prop.name] = args[index];
            index++;
        });


        requestObject = reInitObject(requestObject, inputType);

        var writer = new XmlWriter(function(el) {
            el('s:Envelope', function(el, at) {
                at('xmlns:s', 'http://schemas.xmlsoap.org/soap/envelope/');
                at('xmlns:ns0', inputType.prototype._namespace);
                el('s:Header', '');
                el('s:Body', function(el) {
                    el('ns0:' + methodName, function(el) {
                        requestObject.serialize(el)
                    })
                });
            })
        }, {encoderType: 'numerical'});

        request(getRequestOptions({url: endpoint,body: writer.toString(), method: 'POST'}), function(err, response) {
                    if (err) {
                        callback(err, null);
                        return;
                    }
                    new DomJS().parse(response.body, function(err, responseDom) {
                        if (err) {
                            callback(err, null);
                            return;
                        }
                        var body = responseDom.selectSingleByName('Body', ENVELOPE_SCHEMA);

                        var fault = body.selectByName('Fault', ENVELOPE_SCHEMA);
                        if (fault.length) {
                            var errObject = fault[0].children.length > 1 ? new Error(fault[0].children[1].text()) : fault[0];
                            callback(errObject, null);
                        }
                        else {
                            var result = new outputType();
                            var responseObject = result.deserialize(body.selectSingleByName(outputType.prototype._typeName, outputType.prototype._namespace));
                            callback(null, responseObject['return']);
                        }
                    });
                }
        );
    }


    function checkType(wsdlDom, typeName, parentDom, serviceName) {
        var typeInfo = domjs.parseName(typeName, parentDom);

        if (!typeInfo.namespace)
            throw 'Missing namespace';

        var namespace = types[typeInfo.namespace];

        if (!namespace)
            namespace = types[typeInfo.namespace] = {};

        var type = namespace[typeInfo.name];

        if (type)
            return type;

        wsdlDom.selectByName('types', WSDL_SCHEMA).forEach(function(typesDom) {
            typesDom.selectByName('schema', XS_SCHEMA).forEach(function(schemaDom) {
                function isSameType(dom) {
                    var domTypeInfo = domjs.parseName(dom.attributes['name'], dom);
                    return typeInfo.name == domTypeInfo.name && typeInfo.namespace == domTypeInfo.namespace;
                }

                schemaDom.selectByName('complexType', XS_SCHEMA).forEach(function(complexTypeDom) {
                    if (isSameType(complexTypeDom))
                        type = checkComplexType(wsdlDom, complexTypeDom, typeInfo, serviceName);
                });

                schemaDom.selectByName('simpleType', XS_SCHEMA).forEach(function(complexTypeDom) {
                    if (isSameType(complexTypeDom))
                        type = checkSimpleType(wsdlDom, complexTypeDom, typeInfo, serviceName);
                });
            });
        });

        if (!type)
            throw 'Cant resolve type "' + typeInfo.name + '" in namespace ' + typeInfo.namespace;

        return type;
    }

    function checkComplexType(wsdlDom, dom, typeInfo, serviceName) {
        var sequenceElements = dom.selectByName('sequence', XS_SCHEMA);
        var complexContentElement = dom.selectByName('complexContent', XS_SCHEMA);

        if (!sequenceElements.length && !complexContentElement.length)
            throw 'Unsupported element in XSD schema';

        var baseType;


        if (complexContentElement.length) {
            var extension = complexContentElement[0].selectSingleByName('extension', XS_SCHEMA);
            baseType = checkType(wsdlDom, extension.attributes['base'], extension, serviceName);
            sequenceElements = extension.selectByName('sequence', XS_SCHEMA);
        }
        else
            baseType = BaseComplexType;

        var type = createType({
            name : typeInfo.name,
            namespace: typeInfo.namespace,
            baseType: baseType,
            objectNamespace: serviceName
        });

        sequenceElements.forEach(function(sequenceDom) {
            sequenceDom.selectByName('element', XS_SCHEMA).forEach(function(elementDom) {
                var elementType = checkType(wsdlDom, elementDom.attributes['type'], elementDom, serviceName);

                type.prototype._properties.push({
                    type: elementType,
                    name: elementDom.attributes['name'],
                    isArray: elementDom.attributes['maxOccurs'] == 'unbounded' || parseInt(elementDom.attributes['maxOccurs']) > 1
                });
            });
        });

        return type;
    }

    function checkSimpleType(wsdlDom, dom, typeInfo, serviceName) {

        var restrictionElement = dom.selectSingleByName('restriction', XS_SCHEMA);
        var baseType = checkType(wsdlDom, restrictionElement.attributes['base'], restrictionElement, serviceName);

        return createType({
            name : typeInfo.name,
            namespace: typeInfo.namespace,
            baseType: baseType,
            objectNamespace: serviceName
        });
    }

    request(getRequestOptions({url: clientOptions.wsdl}), function(err, response) {
        if (err) {
            soapCallback(err, null);
            return;
        }

        new DomJS().parse(response.body, function(err, wsdlDom) {
            if (err) {
                soapCallback(err, null);
                return;
            }

            wsdlDom.selectByName('service', WSDL_SCHEMA).forEach(function(serviceDom) {
                serviceDom.selectByName('port', WSDL_SCHEMA).forEach(function(portDom) {
                    var addressDom = portDom.selectSingleByName('address', SOAP_SCHEMA);
                    var location = addressDom.attributes['location'];
                    var bindingInfo = domjs.parseName(portDom.attributes['binding'], portDom);

                    wsdlDom.selectByName('binding', WSDL_SCHEMA).forEach(function(bindingDom) {
                        var currentBindingInfo = domjs.parseName(bindingDom.attributes['name'], bindingDom);
                        if (bindingInfo.name == currentBindingInfo.name && bindingInfo.namespace == currentBindingInfo.namespace) {

                            var bindingTypeInfo = domjs.parseName(bindingDom.attributes['type'], bindingDom);
                            wsdlDom.selectByName('portType', WSDL_SCHEMA).forEach(function(portTypeDom) {
                                function Module() {
                                }

                                var portTypeInfo = domjs.parseName(portTypeDom.attributes['name'], portTypeDom);
                                namespaceObject[portTypeInfo.name] = Module;

                                if (bindingTypeInfo.name == portTypeInfo.name && bindingTypeInfo.namespace == portTypeInfo.namespace) {
                                    portTypeDom.selectByName('operation', WSDL_SCHEMA).forEach(function(operationDom) {

                                        var input = operationDom.selectSingleByName('input', WSDL_SCHEMA);
                                        var output = operationDom.selectSingleByName('output', WSDL_SCHEMA);

                                        var inputType = checkType(wsdlDom, input.attributes['message'], input, portTypeInfo.name);
                                        var outputType = checkType(wsdlDom, output.attributes['message'], output, portTypeInfo.name);

                                        var methodName = operationDom.attributes['name'];
                                        Module.prototype[methodName] = function() {
                                            invokeMethod(methodName, arguments, inputType, outputType, clientOptions.endpoint || location);
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
            });

            soapCallback(null, namespaceObject);
        });
    })

}


exports.SoapClient = SoapClient;