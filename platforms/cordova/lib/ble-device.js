import SubscriptionsManager from '../../../lib/subscriptions-manager.js';
import Watcher from './ble-watcher.js';

const RECONNECT_SCAN_TIMEOUT = 30000;

const BLEDeviceMixin = (Device) => {
    class BLEDevice extends Device {
        constructor(device, ...args) {
            super(...args);
            this.type = 'ble-device';
            this.device = device;
            // An abstract device will not need connection or watcher
            if (this.abstract) {
                return;
            }
            this.onDisconnect = this.onDisconnect.bind(this);
            this.subManager = new SubscriptionsManager({
                subscribe: this._subscribe.bind(this),
                unsubscribe: this._unsubscribe.bind(this),
            });
            this.watcher = new Watcher();
            this.reset(device);
        }
        reset(device) {
            this.device = device;
            this._setupPromise = null;
            this.device.on('disconnect', this.onDisconnect);
            this.state = 'disconnected';
        }
        setState(state) {
            const oldState = this.state;
            this.state = state;
            if (oldState !== state) {
                switch (state) {
                case 'connected': {
                    this.emit('connect');
                    break;
                }
                case 'disconnected': {
                    this.emit('disconnect');
                    break;
                }
                case 'connecting': {
                    this.emit('connecting');
                    break;
                }
                case 'reconnecting': {
                    this.emit('reconnecting');
                    break;
                }
                default: {
                    break;
                }
                }
            }
        }
        onDisconnect() {
            if (this.state === 'disconnected' || this.state === 'connecting') {
                return;
            }
            // Flag all subscriptions as not subscribed
            this.subManager.flagAsUnsubscribe();
            if (!this._manuallyDisconnected) {
                this.reconnect();
            } else {
                this.setState('disconnected');
            }
        }
        onManualDisconnect() {
            this.subManager.clear();
        }
        setup() {
            if (!this._setupPromise) {
                this._setupPromise = this.connect()
                    .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
                    .then(() => this.discover())
                    .then(() => {
                        this.setState('connected');
                    });
            }
            return this._setupPromise;
        }
        connect() {
            if (this.state === 'connected') {
                return Promise.resolve();
            }
            this.setState('connecting');
            return new Promise((resolve, reject) => {
                if (!this.previouslyConnected) {
                    this.device.connect()
                        .then(data => {
                            this.previouslyConnected = true;
                            this.setState('connected');
                            resolve(data);
                        }, err => {
                            this.setState('disconnected');
                            reject(err);
                        });
                } else {
                    this.device.reconnect()
                        .then(data => {
                            this.previouslyConnected = true;
                            this.setState('connected');
                            resolve(data);
                        }, err => {
                            this.setState('disconnected');
                            reject(err);
                        });
                }
            });
        }
        reconnect() {
            this.setState('reconnecting');
            const testFunc = p => BLEDevice.normalizeAddress(p.address) === this.device.address;
            // Was connected before, so address should be available on apple devices
            return this.watcher.searchForDevice(testFunc, RECONNECT_SCAN_TIMEOUT)
                .then((device) => {
                    // Reset this device with the device found through scan
                    this.reset(device);
                    // Custom setup method after a reconnect. Avoids the `connecting` state
                    this._setupPromise = this.device.connect()
                        .then(() => this.discover())
                        .then(() => {
                            // Resubsribe to the characteristics if needed
                            this.subManager.resubscribe();
                            this.setState('connected');
                        });
                    return this.setup();
                })
                .catch(() => {
                    this.setState('disconnected');
                });
        }
        discover() {
            return this.device.discover();
        }
        disconnect() {
            this._manuallyDisconnected = true;
            return this.device.disconnect()
                .then(() => this.setState('disconnected'))
                .then(() => this.onManualDisconnect());
        }
        write(sId, cId, value) {
            return this.setup().then(() => {
                const char = this.getCharacteristic(sId, cId);
                return char.write(value);
            });
        }
        read(sId, cId) {
            return this.setup().then(() => {
                const char = this.getCharacteristic(sId, cId);
                return char.read();
            });
        }
        subscribe(sId, cId, onValue) {
            return this.setup()
                .then(() => this.subManager.subscribe(sId, cId, onValue));
        }
        unsubscribe(sId, cId, onValue) {
            return this.setup()
                .then(() => this.subManager.unsubscribe(sId, cId, onValue));
        }
        _subscribe(sId, cId, callback) {
            const char = this.getCharacteristic(sId, cId);
            return char.subscribe(callback);
        }
        _unsubscribe(sId, cId) {
            const char = this.getCharacteristic(sId, cId);
            return char.unsubscribe();
        }
        getCharacteristic(sId, cId) {
            const service = this.device.services.get(sId);
            return service.characteristics.get(cId);
        }
        toJSON() {
            return {
                id: this.id,
                address: this.device.address,
                bluetooth: {
                    name: this.device.advertisement.localName,
                    address: this.device.address,
                    dfuName: 'DfuTarg',
                    state: this.state,
                },
            };
        }
        terminate() {
            return this.disconnect();
        }

        static localUuid(uuid) {
            return uuid.toUpperCase();
        }

        static normalizeAddress(address) {
            return address.toUpperCase();
        }
        static uInt8ArrayToString(array) {
            return new TextDecoder('utf-8').decode(array);
        }
    }
    return BLEDevice;
};

export default BLEDeviceMixin;
