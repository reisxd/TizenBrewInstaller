import { useState, useContext, useRef, useEffect } from 'preact/hooks';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { useLocation } from 'preact-iso';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { Events } from '../components/WebSocketClient.js';

import Item from "../components/Item.jsx";

export default function InstallFromGitHub() {
    const [name, setName] = useState('');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);

    useEffect(() => {
        ref.current.focus();
    }, [ref]);
    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <Item>
                    <input
                        type="text"
                        ref={ref}
                        value={name}
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.keyCode === 13 || e.keyCode === 65376) {
                                ref.current.blur();
                            }
                        }}
                        onBlur={(e) => {
                            if (name) {
                                state.client.send({
                                    type: Events.InstallPackage,
                                    payload: {
                                        url: name
                                    }
                                });
                            }

                            loc.route('/ui/dist/index.html');
                            setFocus('sn:focusable-item-1');
                        }}
                        placeholder="reisxd/TizenBrew"
                    />
                </Item>
            </div>
        </div>
    )
}