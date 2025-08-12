import { GlobalStateContext } from "../components/ClientContext.jsx";
import { useContext, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { FolderIcon, DocumentIcon } from "@heroicons/react/16/solid";
import { Events } from "../components/WebSocketClient.js";

export default function InstallFromUSB() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();


    useEffect(() => {
        setFocus('sn:focusable-item-1');
    }, [state.sharedData.directory]);

    useEffect(() => {
        state.client.send({
            type: Events.NavigateDirectory,
            payload: '/media'
        });

        setFocus('sn:focusable-item-1');
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center px-2 pt-8">
            <h1 className="text-3xl font-bold text-indigo-400 mb-8 text-center w-full">Install From USB</h1>
            <div className="w-full max-w-2xl rounded-lg shadow-md p-6 bg-slate-900 flex flex-col items-center">
                <ul className="space-y-3 w-full">
                    {state.sharedData.directory.map((file, idx) => {
                        return (
                            <FocusableListItem
                                key={file.path}
                                file={file}
                                index={idx}
                                onClick={() => {
                                    if (file.isDirectory) {
                                        state.client.send({
                                            type: Events.NavigateDirectory,
                                            payload: file.path
                                        });
                                    } else if (file.name.endsWith('.wgt')) {
                                        state.client.send({
                                            type: Events.InstallPackage,
                                            payload: {
                                                url: file.path
                                            }
                                        });
                                        setFocus('sn:focusable-item-1');
                                        loc.route('/ui/dist/index.html');
                                    }
                                }}
                            />
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

function FocusableListItem({ file, onClick }) {
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }

    }, [focused, ref]);

    return (
        <div
            ref={ref}
            tabIndex={0}
            className={`flex items-center gap-4 py-4 px-5 rounded-lg cursor-pointer text-lg select-none border-2
                ${focused ? "bg-slate-700 focus" : "bg-slate-900 border-transparent"} text-indigo-400`}
            style={{ minHeight: 48 }}
            onClick={onClick}
        >
            {file.isDirectory ? (
                <FolderIcon className="h-7 w-7 text-indigo-400" />
            ) : (
                <DocumentIcon className="h-7 w-7 text-indigo-400" />
            )}
            <span className="font-medium truncate" style={{ fontSize: 20 }}>{file.name}</span>
        </div>
    );
}
