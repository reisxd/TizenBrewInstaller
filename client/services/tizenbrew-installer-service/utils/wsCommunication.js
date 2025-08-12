class Connection {
    constructor(connection) {
        this.connection = connection;

    }

    send(data) {
        this.connection.send(JSON.stringify(data));
    }

    Event(event, payload) {
        return {
            type: event,
            payload: payload
        };
    }
}

const Events = {
    InstallPackage: 1,
    NavigateDirectory: 2,
    Error: 3,
    InstallationStatus: 4
};

module.exports = {
    Connection,
    Events
};