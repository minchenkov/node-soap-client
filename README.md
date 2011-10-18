# node-soap-client

SOAP client library for NodeJS.

## Install
    npm install node-soap-client

## Examples

    var SoapClient = require('node-soap-client').SoapClient;

    new SoapClient({wsdl: 'http://api.metabus.ru/0.0.1/ws/SearchingModule?WSDL'}).init(function(err, metabus) {
        var searchingModule = new metabus.SearchingModule();

        searchingModule.search({geoFilter: {distance: 10}, text: ''}, function(err, result) {
            if (err)
                console.log(err.children[1].text())
            else
                console.log(result);
        });

        // or same request in other syntax
        // searchingModule.search(new metabus.SearchQuery({geoFilter: new metabus.GeoFilter({distance: 10}), text: 'кофе около кремля'}), function(err, result) {...})


        // args can be JSON objects or proxy objects, generated from WSDL

        // service methods signature
        // module.method(arg1, arg2, arg3, success_callback)
        // or module.method({"param1": arg1, "param2": arg2, "param3": arg3}, success_callback)
    });

    // Basic authorization is supported:
    // new SoapClient({
    //    wsdl: 'http://api.metabus.ru/0.0.1/ws/SearchingModule?WSDL',
    //    authorization: {
    //       type: 'Basic',
    //       userName: 'Alladin',
    //       password: 'open sesame'
    //    },
    // }).init(function(err, metabus) { ...

