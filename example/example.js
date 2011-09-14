var SoapClient = require('../lib/node-soap-client.js').SoapClient;

new SoapClient({
	wsdl: 'http://api.metabus.ru/0.0.1/ws/SearchingModule?WSDL',
	success: function(metabus) {
		var searchingModule = new metabus.SearchingModule();

		searchingModule.search(new metabus.SearchQuery({geoFilter: {distance: 10}, text: 'кофе около кремля'}), function(result) {
			console.log(result.faceting.marketplaceProperties[0])
		}, function(fault){
			console.log(fault.children[1].text())
		});
	},
	error: function(err) {
		throw err;
	}
});


//new SoapClient({
//    wsdl: 'http://dev.metahouse.ru:8080/configurationManager-0.0.2-SNAPSHOT/ws/ConfigurationManager?wsdl',
//    success: function(metabus) {
//        var cfgManager = new metabus.ConfigurationManager();
//
//        cfgManager.load({configurations: ['pharmacy']}, function(result) {
//            console.log(result)
//        }, function(err){
//            console.log(err)
//        });
//    },
//    error: function(err) {
//        throw err;
//    }
//});
//
//