# node-soap-client

SOAP client library for NodeJS.

## Install
    npm install node-soap-client

## Examples

var SoapClient = require('../lib/node-soap-client.js').SoapClient;

    new SoapClient({
        wsdl: 'http://api.metabus.ru/0.0.1/ws/SearchingModule?WSDL',
        success: function(metabus) {
            var searchingModule = new metabus.SearchingModule();

            searchingModule.search({geoFilter: {distance: 10}, text: 'кофе около кремля'}, function(result) {
                console.log(result.faceting.marketplaceProperties[0])
            }, function(fault){
                console.log(fault.children[1].text())
            });

            // or same request in other syntax
            // searchingModule.search(new metabus.SearchQuery({geoFilter: new metabus.GeoFilter({distance: 10}), text: 'кофе около кремля'}), function(result) {...})

            // proxy methods signature
            // module.method(arg1, arg2, arg3, success_callback, error_callback)
            // or module.method({"param1": arg1, "param2": arg2, "param3": arg3}, success_callback, error_callback)
            // args can be JSON objects or proxy objects, generated from WSDL
        },
        error: function(err) {
            throw err;
        }
    });
