# node-soap-client

SOAP client library for NodeJS.

## Install
    npm install node-soap-client

## Examples

    var XmlWriter = require('simple-xml-writer').XmlWriter;

    var data = new XmlWriter(function(el) {
        el('root', function(el, at) {
            at('xmlns:c', 'http://schemas.xmlsoap.org/wsdl/');
            el('node', function(el, at) {
                at('name', 'foo');
                at('null_attr');
                at('empty_attr', '');

                el('value', 'foo');
                el('null_node');
                el('empty_node', '');
                el('c:value', 'text', function(el) {
                    el('encoding', 'tags:  <br />', function(el, at, text) {
                        at('quotes', '""');
                        el('dd', function(el, at, text) {
                            text('foo')
                            text('bar')
                        })
                    });
                });
            });
        });
    }, { addDeclaration: true });

    console.log(data.toString());

Output:

    <?xml version="1.0" encoding="UTF-8"?>
    <root xmlns:c="http://schemas.xmlsoap.org/wsdl/">
      <node name="foo" empty_attr="">
        <value>foo</value>
        <empty_node/>
        <c:value>
          <encoding quotes="&quot;&quot;">
            <dd>foobar</dd>
            tags:  &lt;br /&gt;
          </encoding>
          text
        </c:value>
      </node>
    </root>
