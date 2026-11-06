import { useSyncExternalStore, type AnchorHTMLAttributes, type ImgHTMLAttributes, type MouseEvent } from 'react';
const routeEvent = 'atlas-route-changed';
function navigate(href:string, replace=false) { const url = new URL(href, window.location.href); if(url.origin !== window.location.origin) { window.location.assign(url); return; } window.history[replace ? 'replaceState' : 'pushState']({}, '', url); window.dispatchEvent(new Event(routeEvent)); }
const router={push:(href:string)=>navigate(href),replace:(href:string)=>navigate(href,true),refresh:()=>window.dispatchEvent(new Event(routeEvent))};
export function useRouter(){ return router; }
function subscribe(callback:()=>void){ window.addEventListener(routeEvent,callback);window.addEventListener('popstate',callback);return()=>{window.removeEventListener(routeEvent,callback);window.removeEventListener('popstate',callback);};}
export function useRoute(){return useSyncExternalStore(subscribe,()=>window.location.pathname+window.location.search,()=>'/portfolio');}
export function Link({href,onClick,target,...props}:AnchorHTMLAttributes<HTMLAnchorElement> & {href:string}){function click(event:MouseEvent<HTMLAnchorElement>){onClick?.(event);if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||target||props.download)return; const url=new URL(href,window.location.href);if(url.origin===window.location.origin&&!href.startsWith('/api/')&&!href.startsWith('/signin-')){event.preventDefault();navigate(href);}}return <a {...props} href={href} target={target} onClick={click}/>;}
export function Image({fill,unoptimized:_,style,alt,...props}:ImgHTMLAttributes<HTMLImageElement> & {fill?:boolean;unoptimized?:boolean;alt:string}) {
  void _;
  // Original private files are served directly by the hosted app; no Next image optimizer is present.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%',...style}:style}/>;
}
