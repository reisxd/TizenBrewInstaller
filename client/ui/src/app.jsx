import { LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import Home from './pages/Home.jsx';
import Header from './components/Header.jsx';
import { GlobalStateContext } from './components/ClientContext.jsx';
import { useRef } from 'preact/hooks';
import { useEffect, useState, useContext } from 'react';
import Client from './components/WebSocketClient.js';
import InstallFromGitHub from './pages/InstallFromGitHub.jsx';
import InstallFromUSB from './pages/InstallFromUSB.jsx';
import About from './pages/About.jsx';
import './components/i18n.js';
import { ExclamationCircleIcon } from '@heroicons/react/16/solid';
import { useTranslation } from 'react-i18next';
import Desktop from './pages/Desktop.jsx';

export default function App() {
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const context = useContext(GlobalStateContext);
  const { t } = useTranslation();
  window.dispatch = context.dispatch;
  window.state = context.state;

  useEffect(() => {
    if (context.state.sharedData.error.disappear) {
      setTimeout(() => {
        context.dispatch({
          type: 'SET_ERROR',
          payload: {
            message: null,
            disappear: false
          }
        });
      }, 5000);
    }
  }, [context.state.sharedData.error.disappear]);
  useEffect(() => {
    setHeaderHeight(headerRef.current.base.clientHeight);
  }, [headerRef]);

  useEffect(() => {
    if (!window.setClient) {
      startService(context);
      window.setClient = true;
    }
  }, []);


  return (
    <ErrorBoundary>
      <LocationProvider>
        <Header ref={headerRef} />
        <div className="bg-slate-800 text-white overflow-hidden" style={{ height: `calc(100vh - ${headerHeight}px)` }}>
          <div className={`flex justify-center ${!context.state.sharedData.error.message ? 'hidden' : ''}`}>
            <div class="flex items-center p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 bg-slate-900 mt-8 w-[95vw] text-red-400" role="alert">
              <ExclamationCircleIcon className="h-[4vw] w-[2vw] mr-2" />
              <div>
                <span class="text-2xl">{t(context.state.sharedData.error.message, context.state.sharedData.error.args)}</span>
              </div>
            </div>
          </div>
          {context.state.client && <Router>
            <Route component={Home} path="/ui/dist/index.html" />
            <Route component={Desktop} path="/ui/dist/index.html/desktop" />
            <Route component={InstallFromGitHub} path="/ui/dist/index.html/install-from-gh" />
            <Route component={InstallFromUSB} path="/ui/dist/index.html/install-from-usb" />
            <Route component={About} path="/ui/dist/index.html/about" />
          </Router>}
        </div>
      </LocationProvider>
    </ErrorBoundary>
  );
}


function startService(context) {
  const testWS = new WebSocket('ws://localhost:8091/probe');

  testWS.onerror = () => {
    if (typeof tizen === 'undefined') {
      context.dispatch({ type: 'SET_ERROR', payload: { message: 'errors.serviceConnectionFailed', disappear: false } });
      return;
    }
    const pkgId = tizen.application.getCurrentApplication().appInfo.packageId;

    const serviceId = pkgId + ".InstallerService";

    tizen.application.launchAppControl(
      new tizen.ApplicationControl("http://tizen.org/appcontrol/operation/service"),
      serviceId,
      function () {
        context.dispatch({
          type: 'SET_STATE',
          payload: 'service.started'
        });

        window.location.reload();
      },
      function (e) {
        alert("Launch Service failed: " + e.message);
      }
    );
  }

  testWS.onopen = () => {
    context.dispatch({
      type: 'SET_STATE',
      payload: 'service.alreadyRunning'
    });

    testWS.close();
    // A file:// / packaged TV origin must not receive service credentials.
    // Switch to the service's same-origin UI before requesting a session token.
    if (location.protocol !== 'http:' ||
        ['localhost:8091', '127.0.0.1:8091'].indexOf(location.host) === -1) {
      // Preserve native-only installation detection across the origin change.
      // This is display/bootstrap metadata, never an authorization credential.
      const nativeRuntime = {};
      try { nativeRuntime.packageId = tizen.application.getAppInfo().packageId; } catch (e) { }
      try {
        tizen.application.getAppInfo('xvvl3S1bvH.TizenBrewStandalone');
        nativeRuntime.tizenbrewInstalled = true;
      } catch (e) { }
      try {
        tizen.application.getAppInfo('xvvl3S1bTU.TizenBrewStandalone');
        nativeRuntime.installerInstalled = true;
      } catch (e) { }
      location.replace('http://localhost:8091/ui/dist/index.html#startup=' + encodeURIComponent(JSON.stringify(nativeRuntime)));
      return;
    }
    fetch('/session', { method: 'POST', credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error('Session rejected');
        return response.json();
      })
      .then(session => {
        let nativeRuntime = {};
        if (session.isTV && location.hash.indexOf('#startup=') === 0) {
          try { nativeRuntime = JSON.parse(decodeURIComponent(location.hash.slice(9))) || {}; } catch (e) { }
        }
        context.dispatch({ type: 'SET_RUNTIME', payload: {
          isTV: session.isTV, tvAddress: session.tvAddress, nativeRuntime
        } });
        context.dispatch({ type: 'SET_CLIENT', payload: new Client(context, session.token) });
      })
      .catch(() => context.dispatch({ type: 'SET_ERROR', payload: {
        message: 'errors.serviceConnectionFailed', disappear: false
      } }));

  }
}