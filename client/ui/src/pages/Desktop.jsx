import { ArrowDownIcon, TvIcon } from '@heroicons/react/16/solid';
import { useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import Item from '../components/Item.jsx';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'preact-iso';
import { Events } from '../components/WebSocketClient.js';
import { useEffect } from 'preact/hooks';

export default function Desktop() {
    const context = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const loc = useLocation();
    const [ip, setIp] = useState('');
    const ipInputRef = useRef(null);

    useEffect(() => {
        if (
            context.state.client !== null &&
            context.state.client.socket &&
            context.state.client.socket.readyState === WebSocket.OPEN
        ) {
        }
    }, [context.state.client, context.state.client?.socket?.readyState]);

    return (
        <div className="relative isolate lg:px-8 xs:overflow-scroll xs:max-h-[90vh] lg:!overflow-visible lg:!max-h-[100%]">
            {context.state.sharedData.qrCodeShow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="p-8 rounded-2xl shadow-2xl max-w-full">
                        <h3 className="text-3xl font-bold mb-4">{t('resigning.resigningRequired')}</h3>
                        <p className="text-xl mb-4 whitespace-pre">{t('resigning.resigningRequiredPCDesc')}</p>
                        <button
                            className="mb-4 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white font-semibold px-4 py-2 rounded-lg shadow-md"
                            onClick={() => {
                                window.open('https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h&actionID=StartOAuth2&accessToken=Y&redirect_uri=http://localhost:4794/signin/callback', '_blank');
                            }}
                        >
                            {t('resigning.resigningRequiredOpenAuthButton')}
                        </button>
                    </div>
                </div>
            )}
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {context.state.sharedData.connectedToTV ? (
                    <>
                        <Item onClick={() => {
                            context.state.client.send({
                                type: Events.InstallPackage,
                                payload: {
                                    url: 'reisxd/TizenBrew'
                                }
                            })
                        }}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                <span className='flex items-center gap-2'>
                                    <ArrowDownIcon className='h-8 w-8 text-indigo-400' />
                                    {t('installer.installTB')}
                                </span>
                            </h3>
                        </Item>
                        <Item onClick={() => {
                            context.state.client.send({
                                type: Events.InstallPackage,
                                payload: {
                                    url: 'reisxd/TizenBrewInstaller'
                                }
                            })
                        }}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                <span className='flex items-center gap-2'>
                                    <ArrowDownIcon className='h-8 w-8 text-indigo-400' />
                                    {t('installer.installTBI')}
                                </span>
                            </h3>
                        </Item>
                        <Item onClick={() => {
                            loc.route('/ui/dist/index.html/install-from-gh');
                        }}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                <span className='flex items-center gap-2'>
                                    <ArrowDownIcon className='h-8 w-8 text-indigo-400' />
                                    {t('installer.installFromGH')}
                                </span>
                            </h3>
                        </Item>
                    </>
                ) : (
                    <Item>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            <span className='flex items-center gap-2'>
                                <TvIcon className='h-8 w-8 text-indigo-400' />
                                {t('installer.connectToTV')}
                            </span>
                        </h3>
                        <input
                            type="text"
                            value={ip}
                            ref={ipInputRef}
                            className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                            onChange={(e) => setIp(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.keyCode === 13 || e.keyCode === 65376) {
                                    ipInputRef.current.blur();
                                }
                            }}
                            onBlur={(e) => {
                                if (ip) {
                                    state.client.send({
                                        type: Events.ConnectToTV,
                                        payload: ip
                                    });
                                }
                            }}
                            placeholder="TV IP (i.e. 192.168.1.2)"
                        />
                    </Item>
                )
                }
            </div>
        </div>
    );
}
