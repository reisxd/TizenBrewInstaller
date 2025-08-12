import { render } from 'preact'
import './index.css'
import App from './app.jsx'
import { GlobalStateProvider } from './components/ClientContext.jsx'
import { init, setFocus } from '@noriginmedia/norigin-spatial-navigation';

init({ });

window.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) {
        document.querySelector('.focus')?.click();
    } else if (e.keyCode === 10009) {
        if (location.pathname !== '/tizenbrew-ui/dist/index.html') {
            history.back();
            setFocus('sn:focusable-item-1');
        } else {
            tizen.application.getCurrentApplication().exit();
        }
    }
});

render(<GlobalStateProvider><App /></GlobalStateProvider>, document.getElementById('app'));