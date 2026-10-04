// Local, empty public data only. No proxying, credentials or external writes.
import http from 'node:http';
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const data=path==='/api/v1/legal/terms/current'?{terms_version:'1.2'}:
 path==='/api/v1/public/listings'||path==='/api/v1/data-requests'?{items:[],total:0,page:1,per_page:20,pages:0}:
 path==='/api/v1/public/featured-listings'?{items:[],locale:'en',item_list:null}:
 path==='/api/v1/public/sitemap-entries'||path==='/api/v1/public/request-sitemap-entries'?{entries:[]}:null;
 res.writeHead(data===null?404:200,{'Content-Type':'application/json'});res.end(JSON.stringify(data??{detail:'not in T932 build fixture'}));
});server.listen(4201,'127.0.0.1');
