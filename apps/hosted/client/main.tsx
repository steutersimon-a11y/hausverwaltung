import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { AtlasWorkspace, type WorkspaceView } from './components/atlas-workspace';
import ImportsPage from './imports';
import { useRoute } from './shims';
import './styles.css';
const views:Record<string,WorkspaceView>={'/':'portfolio','/portfolio':'portfolio','/aufgaben':'tasks','/dokumente':'documents','/datenqualitaet':'quality','/einstellungen':'settings'};
function App(){const route=useRoute();const path=route.split('?')[0].replace(/\/$/,'')||'/';useEffect(()=>{document.title='ATLAS · Private Hausverwaltung';try{document.documentElement.dataset.theme=localStorage.getItem('atlas-theme')==='light'?'light':'dark';}catch{document.documentElement.dataset.theme='dark';}},[]);if(path==='/importe')return <ImportsPage/>;if(path==='/signin-with-chatgpt')return <div className="loading-page"><h1>Dein privater Arbeitsbereich</h1><a className="button primary" href="/signin-with-chatgpt" target="_top">Mit ChatGPT anmelden</a></div>;if(!(path in views))return <div className="loading-page"><h1>Diese Seite wurde nicht gefunden.</h1><a className="button primary" href="/portfolio">Zum Portfolio</a></div>;return <AtlasWorkspace key={route} initialView={views[path]}/>;}
const root=document.getElementById('root');if(!root)throw new Error('App root missing');createRoot(root).render(<App/>);
