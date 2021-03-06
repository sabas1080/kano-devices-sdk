import {CordovaSetup, CordovaTeardown} from '../mock/cordova.js';
import Manager from '../../../platforms/cordova/index.js';

suite('#Devices', () => {
    setup(() => {
        CordovaSetup();
    });
    test('searchForDevice()', () => {
        return new Promise((resolve, reject) => {
            let devicePrefix = 'Kano-Wand'; // add more devices if needed.
            Manager.searchForDevice(devicePrefix, 1000)
                .then(wand => {
                    // At this point the device shouldn't scan for other devices.
                    window.bluetoothle.isScanning((scanning) => {
                        if (scanning === true) {
                            reject(new Error("The device shouldn't be scanning"));
                        }
                    }, (err) => reject(new Error('Unable to check if device is scanning')));

                    if (wand.device.name.startsWith(devicePrefix)) {
                        return resolve();
                    }
                    return reject(new Error('Unable to get the device.'));
                })
                .catch(reject);
        });
    });
    test('searchForClosestDevice()', () => {
        return new Promise((resolve, reject) => {
            Manager.searchForClosestDevice('wand', 1000)
                .then(device => {
                    // At this point the device shouldn't scan for other devices.
                    window.bluetoothle.isScanning((scanning) => {
                        if (scanning === true) {
                            reject(new Error("The device shouldn't be scanning"));
                        }
                    }, (err) => reject(new Error('Unable to check if device is scanning')));

                    window.bluetoothle.emittedDevices.forEach(dev => {
                        if (Manager.getDeviceID(dev.name) == device.type && dev.rssi > device.device.rssi) {
                            return reject(new Error('Found a closer device.'));
                        }
                    });
                    return resolve();
                })
                .catch(reject);
        });
    });
    teardown(() => {
        Manager.terminate();
        CordovaTeardown();
    });
});
