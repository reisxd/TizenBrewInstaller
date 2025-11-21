import i18next from 'i18next';

const Events = {
    InstallPackage: 1,
    NavigateDirectory: 2,
    Error: 3,
    InstallationStatus: 4,
    DeleteConfiguration: 5,
    ConnectToTV: 6
};

class Client {
    constructor(context) {
        this.context = context;
        this.socket = new WebSocket('ws://localhost:8091');
        this.socket.onopen = this.onOpen.bind(this);
        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onerror = () => location.reload();
    }

    onOpen() {
    }

    onMessage(event) {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        switch (type) {
            case Events.InstallPackage: {
                // Handle package installation statuses
                const requiresResigning = payload.response === 2;
                if (requiresResigning) {
                    this.context.dispatch({
                        type: 'SET_QR_CODE',
                        payload: true
                    });
                } else if (payload.response === 0) {
                    const installFailedLine = payload.result.split('\n').find(line => line.includes('install failed'));
                    if (installFailedLine) {
                        this.context.dispatch({
                            type: 'SET_ERROR',
                            payload: {
                                message: i18next.t('installStatus.installFailed', { line: installFailedLine }),
                                disappear: false
                            }
                        });

                        if (installFailedLine.includes('Check certificate error')) {
                            this.send({
                                type: Events.DeleteConfiguration
                            });
                        }
                    }
                } else {
                    this.context.dispatch({
                        type: 'SET_QR_CODE',
                        payload: false
                    });
                }
                break;
            }

            case Events.NavigateDirectory: {
                // Handle directory navigation
                this.context.dispatch({
                    type: 'SET_DIRECTORY',
                    payload: payload
                });
                break;
            }

            case Events.Error: {
                // Handle errors
                this.context.dispatch({
                    type: 'SET_ERROR',
                    payload: {
                        message: i18next.t(payload),
                        disappear: false
                    }
                });
                break;
            }

            case Events.InstallationStatus: {
                // Handle installation status updates
                this.context.dispatch({
                    type: 'SET_STATE',
                    payload: payload
                });
                break;
            }

            case Events.ConnectToTV: {
                // Handle connection to the TV
                this.context.dispatch({
                    type: 'SET_CONNECTED_TO_TV',
                    payload: payload.success
                });
                
                if (!payload.success) {
                    this.context.dispatch({
                        type: 'SET_ERROR',
                        payload: {
                            message: payload.error,
                            disappear: false
                        }
                    });
                }
                break;
            }
        }
    }

    send(data) {
        this.socket.send(JSON.stringify(data));
    }
}

export { Events };
export default Client;