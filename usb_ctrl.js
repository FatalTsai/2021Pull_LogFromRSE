const executor = require('child_process').exec; // use on function executorCmd (can be merge to tool?)

const fs = require('fs');
// const querystring = require('querystring');
require('./mcu_communication.js');
// const http = require('http');
const versionNode = '/data/software_version.json';

// const { DownloaderHelper } = require('./DL_helper/DL_helper');
const { byteHelper } = require('./DL_helper/helpers');

// SYNC-TEC Updater
// const client = require("./sync-tec/lib/update_client");
const { UpdateClient } = require("./sync-tec/lib/update_client");
const platform_interface = require("./sync-tec/platform_interface");
const ui_interface = require("./sync-tec/ui_interface");
const result_callback = require("./sync-tec/result_callback_interface");
const auth= require("./sync-tec/auth_interface.js");

const log_config = require('./sync-tec/log_config.json');
const logging = require('./sync-tec/lib/logging');
const logger = new logging.Logger(log_config); // log path must change in BYOC RSE
// const AdmZip = require("adm-zip");

const protocol = require("./sync-tec/lib/protocol.json");
// const result_types= require("./sync-tec/lib/result_types.json");
let sc = undefined;
let demo_platform = undefined;
let demo_ui = undefined;
let demo_callback = undefined;
let demo_auth = undefined;
// SYNC-TEC Updater

eventEmitter.addListener(Const.OTA_MSG, checkAction);

// Installation
// const installPath = '/var/volalite/';
const unpackPath = '/mnt/DATA/sync-tec/cache/';
const synctecPath = '/mnt/DATA/sync-tec/';
let counter = 0;
let start = 0;
let page = 0;

let upgradeStatus;
let OTA_Type = 0;

let fileend; /* For MCU update */
// let isOtaDownloadByPhone = false;

// const delayForMessage = 3000;

/* HTTP Download */
// let progressCnt = 0;
// let downloadReq = undefined;
// let dlReq;
// let cancelByUser = false;
// let downloadTimeout = undefined;

// Urgent Usage
// let OTA_BRAND; // [20200904]
let autoChecker = false; // [20200917]

const upgradeStatusEnum = {
	upgradeLdRom: 1,
	upgradeApRom: 2,
	bootMcu: 3,
};

const bootFailEnum = {
	bootfailLdRom: 1,
	bootfailApRom: 0,
};

const ota = 'payload.bin';
const otaProp = 'payload_properties.txt';
const otaLDROM = 'mcuupdate.bin';
const otaAPROM = 'mcuapupdate.bin';

let mcuota = 'mcuupdate.bin';

// const pathGet = {
// 	host: 'byoc.jet-opto.com.tw',
// 	port: 1628,
// 	path: '',
// };

const UpdateType = {
	NO_NEED: -1,
	USB: 0,
	CPU: 1,
	MCU: 2,
	ALL: 3,
};

const postData = {
	// 'cpu_file': '',
	// 'brand': '',
	// 'mcu_file': '',
	// 'branch': 'brook',
	'type': UpdateType.NO_NEED,
	// 'size': 0,
	// 'current': 0,
};

/* ============================== Section 1 START ============================== */

/**
 * Function: check what to do, Action send from HMI
 * @param {String} data
 */
async function checkAction(data) {
    switch (data.action) {
        case 'check_update':
            usb_ota_server_available();
            break;
        case 'do_ota':
            do_ota();
            break;

        case 'cancel_download':
            console.log(`===== INFO: CANCEL DOWNLOAD`);
            // if (OTA_BRAND == 'bentley') {
                if (sc) {
                    await demo_platform.cancelDownload();
                    // clearSynctecClient();
                }
                await deleteUpdate();
            break;

        case 'do_ota_update':
            // Sync-tec
            logger.i(`===== DO INSTALLATION`); // [20200902]
            WifiTool.wifi_on_off(false); // [20201014]
            eventEmitter.emit(Const.ENABLE_POWERKEY, false) // [20210327] disable SK
            eventEmitter.emit('handle_url', false) // [20210327] hide setup wizard
            process.env.SCREEN = Const.INSTALL_UPDATE;
            if (postData['type'] == UpdateType.USB) { // [20200908]
                logger.i(`===== DO INSTALLATION TYPE ${UpdateType.USB} [-1:NO 0:USB 1:CPU 2:MCU 3:ALL]`);
                otaUpdateType(UpdateType.USB);
                doInstallation(UpdateType.USB);
            } else if (fs.existsSync(`${synctecPath}pkg.txt`)) {
                let isCorrupted = true;
                try {
                    if (!fs.existsSync(unpackPath)){
                        fs.mkdirSync(unpackPath);
                    }
                    await Tool.executorCmd(`rm -rf ${unpackPath}*`);
                    let rawdata = fs.readFileSync(`${synctecPath}pkg.txt`);
                    logger.d(rawdata.toString());
                    let pre = JSON.parse(rawdata);
                    let fileSHA1 = await Tool.ChecksumSHA1(`${synctecPath}${pre.filename}`);
                    let fileSize = fs.statSync(`${synctecPath}${pre.filename}`).size;
                    logger.d(`========== INFO: INSTALLATION FILE EXIST AND SIZE ${pre.filesize} ${fileSize}`);
                    logger.d(`========== INFO: INSTALLATION FILE EXIST AND CHECKSUM ${pre.checksum} ${fileSHA1}`);
                    isCorrupted = (fileSHA1 == pre.checksum && fileSize == pre.filesize) ? false : true;

                    if (!isCorrupted) {
                        await Tool.executorCmd(`unzip ${synctecPath}${pre.filename} -d ${unpackPath}`);
                    } else {
                        logger.e(`========== ERROR: FILE CORRUPTED! ${isCorrupted}`);
                        // sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} ));
                        await deleteUpdate();
                        // WifiTool.wifi_on_off(true); // [20201014]
                        localStorage.setItem('ota_checking', 'downloaded');
                        localStorage.setItem('installing', 'CPU');
                        reboot();
                        return;
                    }
                } catch (err){
                    logger.e(err);
                }
                let type = await doInstallType(); // [20200903]
                if (type > UpdateType.NO_NEED) {
                    logger.i(`===== DO INSTALLATION TYPE ${type} [-1:NO 0:USB 1:CPU 2:MCU 3:ALL]`);
                    otaUpdateType(type);
                    doInstallation(type);
                } else {
                    logger.e(`===== INSTALLATION IS TYPE NO NEED`);
                    sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} ));
                    WifiTool.wifi_on_off(true); // [20201014]
                }
            } else {
                logger.i(`===== SYNC-TEC INSTALLATION FILE NOT FOUND`);
                sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} ));
                WifiTool.wifi_on_off(true); // [20201014]
            }
            eventEmitter.emit(Const.TIMER_HANDLE, {enable: false});
            eventEmitter.emit(Const.SCREEN_TIMEOUT_STOP);
            break;

        case 'delete_update':
            await deleteUpdate();
            break;
        case 'do_auto_check':
            let brandInfo = await Tool.getBrand();
            // if (brandInfo == 'audi' || brandInfo == 'porsche') { return; } // [20200919] No Audi&Porsche
            if (autoChecker == true) { return; }
            autoChecker = true;
            let devSerial = await Tool.getSerial();
            logger.i(`DO AUTO CHECK`);
            let auto_platform = new platform_interface.PlatformProvider();
            let auto_ui = new ui_interface.UiInterface();
            let auto_callback = new result_callback.ResultCallback();
            let auto_auth = new auth.Authentication();
            await auto_platform.setDeviceID(devSerial);
            await auto_platform.setProductID(brandInfo);

            let auto_sc = new UpdateClient(auto_ui, auto_platform, auto_auth, auto_callback, logger); // [20200827] Zane: Might be duplicate
            let result = await auto_sc.requestUpdateInfo();

            logger.i("<<< post request (AUTO CHECK)");
            logger.i(`Result: ${result} (AUTO CHECK)`);
            if (result == protocol.flags.SYSTEM_UPDATE_AVAILABLE) {
                sendWebsocketBroadcast(JSON.stringify(
                    {'task': 'ota_download_progress', 'action': 'has_updates'}
                ));
            }
            // autoChecker = true;
            break;
        // case 'cancel_auto_check':
        //     break;
        default:
            break;
    }
}

/**
 * Function: SYNC-TEC update client
 */
async function checkSyncTec() {

    let devSerial = await Tool.getSerial();
    // let devSerial =  demo_platform.getDeviceId();
    // console.log(`${ devSerial }`);

    if (sc) {
        await clearSynctecClient();
        console.log(`===== INFO: UPDATE CLIENT FOUND`);
    }
    if (!fs.existsSync(synctecPath)){
        fs.mkdirSync(synctecPath);
    }
    demo_platform = new platform_interface.PlatformProvider();
    demo_ui = new ui_interface.UiInterface();
    demo_callback = new result_callback.ResultCallback();
    demo_auth = new auth.Authentication();
    await demo_platform.setDeviceID(devSerial);
    let brandInfo = await Tool.getBrand();
    await demo_platform.setProductID(brandInfo);

    sc = new UpdateClient(demo_ui, demo_platform, demo_auth, demo_callback, logger); // [20200827] Zane: Might be duplicate
    var result = await sc.requestUpdateInfo();

    logger.i("<<< post request");
    logger.i(`Result: ${result}`);
    if (result == 0) {
        sendWebsocketBroadcast(JSON.stringify({
            'task': 'check_update', 'available': false, 'isUSB': false,
        }));
    } else if (result == protocol.flags.SYSTEM_UPDATE_AVAILABLE) {
        let state = localStorage.getItem('ota_checking');   // [20200901]
        if ( state == 'downloading' ) { // Is power off resume
            try {
                doDownloadSyncTec();
            } catch (err) {
                logger.e(`===== ERROR: RESUME ${err}`);
            }
        } else {

            console.log(JSON.stringify({
                'task': 'check_update', 'available': true, 'isUSB': false,
                'RSE_version': sc.askRespRec.updatePackages[0].version, 'size': byteHelper(sc.askRespRec.updatePackages[0].filesize, false)
            }));

            sendWebsocketBroadcast(JSON.stringify({
                'task': 'check_update', 'available': true, 'isUSB': false,
                'RSE_version': sc.askRespRec.updatePackages[0].version, 'size': byteHelper(sc.askRespRec.updatePackages[0].filesize, false)
                // 'task': 'check_update', 'available': true, 'isUSB': false,
            }));
        }
    // } else if (result == protocol.error_codes.ERR_SERVER_ERROR || result == protocol.error_codes.ERR_PROTOCOL ||
    //            result == protocol.error_codes.ERR_PLATFORM || result == protocol.error_codes.ERR_CONNECTION) {
    } else {
        sendWebsocketBroadcast(JSON.stringify({
            'task': 'check_update', 'available': false, 'isUSB': false, 'unreachable': true
        }));
    }

    // result = await sc.sendDiagData(null);
    // console.log("Result"+result);
    // return false;
}

/**
 * Start Sync-tec downloader
 */
async function doDownloadSyncTec() {
    localStorage.setItem('otaDownloading', 'true');
    let result = await sc.doDownload().then( async (result) => {
        localStorage.setItem('otaDownloading', 'false');
        if (result == protocol.flags.OK) {
            await Tool.executorCmd('sync');
            localStorage.setItem('ota_checking', 'downloaded');
        }
        if (result != protocol.flags.USER_REJECT) {
            sendWebsocketBroadcast(JSON.stringify({
                'task': 'ota_download_progress',
                'action': 'download_finished',
                'reason': (result == protocol.flags.OK) ? 'download_success': 'download_failed'
            }));
        }
    });
}

/**
 * Function: Selecting update mode
 * Description: Check USB update file Available(USB). If not exist, try OTA server mode.
**/
async function usbOtaAvailable() {
    const response = {
        'task': 'check_update',
    };
    /* USB update data exist, then switch to usb mode. otherwise, try Server mode */
    try {
        const usbPath = await fetchMountPoint();
        const available = fs.existsSync(usbPath + '/' + ota) && fs.existsSync(usbPath + '/' + otaProp);

        console.log('usbOtaAvailable available = ', available);
        if (available == true) {// USB is available
            response['available'] = true;//available; why need two para?
            response['isUSB'] = true;
            sendWebsocketBroadcast(JSON.stringify(response));
            postData['type'] = UpdateType.USB;
            // isOtaDownloadByPhone = false;
        } else {
            // if (OTA_BRAND == 'bentley') {
                postData['type'] = UpdateType.NO_NEED; // [20200922]
                checkSyncTec();
            // } else {
            //     otaServerAvailable();
            // }
        }
    } catch (err) {
        // if (OTA_BRAND == 'bentley') {
            postData['type'] = UpdateType.NO_NEED; // [20200922]
            checkSyncTec();
        // } else {
        //     otaServerAvailable();
        // }
    }
};

async function doUsbOta() {
    // const response = {
    //     'task': 'do_update',
    // };
    let usbPath = '';

    try {
        usbPath = await fetchMountPoint();
    } catch (err) {
        // response['available'] = false;
        // response['err'] = 'OTA file does not exist';
        // response['err'] = 'USB Not Found';
        // sendWebsocketBroadcast(JSON.stringify(response));
        logger.e(`USB Not Found`)
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200922]
        WifiTool.wifi_on_off(true); // [20201014]
        // winston.error(err);
        return;
    }

    OTA_Type = UpdateType.USB;
    const available = fs.existsSync(usbPath + '/' + ota) && fs.existsSync(usbPath + '/' + otaProp);

    if (available == false) {
        // response['available'] = false;
        // response['err'] = 'OTA file does not exist';
        // sendWebsocketBroadcast(JSON.stringify(response));
        logger.e(`OTA file does not exist`)
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200922]
        WifiTool.wifi_on_off(true); // [20201014]
        // winston.error(err);
        return;
    }

    // response['update_status'] = true;
    // sendWebsocketBroadcast(JSON.stringify(response));
    doUsbCpuOta();
};

async function doUsbCpuOta() {
    let usbPath = '';
    usbPath = await fetchMountPoint();
    // const child = executor('/usr/bin/byoc_webserver/imtester.sh ' + usbPath + '/' + otaProp + ' ' + + '/' + otaProp);
    const child = executor(`/usr/bin/byoc_webserver/imtester.sh ${usbPath}/${otaProp} ${usbPath}/${ota}`);
    // const child = Tool.executorCmd('/usr/bin/byoc_webserver/imtester.sh ' + usbPath + '/payload_properties.txt ' + usbPath);
    localStorage.setItem('installing', 'CPU');

    console.log('usbPath = ', usbPath);

    child.stdout.on('data', function(data) {
        console.log('data:-- ', data);
        sendCpuProgress(data);
    });
    child.on('exit', function(code) {
        const updateInfo = {};
        // Analyze abupdate is success or not
        fs.readFile('/proc/cmdline', (err, data) => {
            const stringData = data.toString();
            // const updateType = stringData.slice(stringData.length-2, stringData.length-1);
            const updateType = stringData.match(/androidboot.slot_suffix=_[ab]/g)[0].replace('androidboot.slot_suffix=_', ''); // [20200925] Zane: String changed on R8.6.4 (New BL2)

            updateInfo['ota_type'] = updateType;
            const content = JSON.stringify(updateInfo);

            fs.writeFile('/data/otaType.json', content, function(err) {
                if (err) {
                    if (fs.existsSync('/data/otaType.json')) {
                        logger.e('===== ERROR: [USB CPU 1] DELETE SLOT RECORD');
                        fs.unlink('/data/otaType.json');
                    }
                    // WifiTool.wifi_on_off(true); // [20201014]
                    return logger.e(`===== ERROR: [USB CPU 2] USB CPU ${err}`);
                }
                logger.i('Update CPU finish');
                usbMcuAvailable();
            });
        });
    });
};

/* ============================== Utility ============================== */

/**
 * Clear Sync-tec update client
 */
async function clearSynctecClient() {
    try {
        sc = undefined;
        demo_platform = undefined;
        demo_ui = undefined;
        demo_callback = undefined;
        demo_auth = undefined;
    } catch(err) {
        logger.e(`===== ERROR: CLEAR SYNC-TEC CLIENT: ${err}`);
    }
}

/**
 * Delete Package (User or File Corrupted)
 */
async function deleteUpdate() {
    try {
        clearSynctecClient();
        localStorage.removeItem('ota_checking');
        Tool.executorCmd(`rm -rf ${synctecPath}*`);
        // await Tool.executorCmd('sync /cache/webServStorage'); // [20200905]
        await Tool.executorCmd('sync');
    } catch(err) {
        logger.e('===== ERROR: DELETE UPDATE: ', err);
    }
    logger.i('===== DELETE UPDATE DONE');
}

/**
* Get usb mount point
* @return {Promise} USB path
*/
function fetchMountPoint() {
    return Tool.executorCmd('lsblk | grep media | awk \'{print $7}\'');
}


/** // [Not Using]
* Get file size in bytes
* @param {string} filename
* @return {number}
*/
function getFilesizeInBytes(filename) {
    return fs.statSync(filename).size;
}

/**
* Convert message to Hex Buffer
* @param {string} str
* @param {boolean} paddingStart
* @return {Buffer} Hex buffer
*/
function stringtoHex(str, paddingStart) {
	const STX = '0951';
	const DELIMITER = '20';
	let _val = '';
	const len = '0111';

	if (paddingStart) {
		_val = STX + len + DELIMITER;
	}

	for (let i = 0; i < str.length; i++) {
		if (_val == '') {
			_val += str.charCodeAt(i).toString(16).padStart(2, '0');
		} else {
			_val += str.charCodeAt(i).toString(16).padStart(2, '0');
		}
	}
	return new Buffer(_val, 'hex');
}

function showRebootMessage() {
    localStorage.setItem('ota_checking', 'installed');
    localStorage.removeItem('installing');
    sendWebsocketBroadcast(JSON.stringify({
        'task': 'usb_ota', 'success': 1
    }));
};

/**
* Reboot function
*/
async function reboot() {
    // executor('sync && sleep 1 && systemctl reboot');
    // Tool.executorCmd('sync && sleep 1 && systemctl reboot');
    await Tool.executorCmd('sync && sleep 1');
    rebootMcu();
};

/**
 * Function: Reboot system
 * Description: Must using MCU Reboot to avoid MCU kept previous status, MCU will restart the main power
 */
function rebootMcu() {
  	portWrite('MCU BOOT_SYSTEM');
};

function mcuChecksum(param) {
	let tmp = 0;
	const array = [...param];

	for (i = 0; i < array.length; i++) {
		tmp += array[i];
	}
	return tmp.toString(16).slice(-2).toString();
};

/* ============================== Exported ============================== */

/**
 * Function: Use to check recovery file exist on USB
 * Parameter: param (Type) [0:ApRom 1:Ldrom]
 *            res (Callback) [boolean]
 * Return: res (callback) [boolean]
 * Description: MCU recovery while type is LDROM, will checking all file.
**/
async function usb_ota_mcu_available(param, res) {
    const usbPath = await fetchMountPoint();
    const available = fs.existsSync(usbPath + '/' + otaLDROM);
    const apAvailable = fs.existsSync(usbPath + '/' + otaAPROM);

    console.log('usb_ota_mcu_available param : ', param);

    if (param == 0) { // judge APROM is exist or not
        res(apAvailable);
    } else { // judge APROM and LDROM is exist or not
        res(available && apAvailable);
    }
};

async function do_ota(param, res) {
    // res({});
    const response = {
        'task': 'download_update',
    };
    OTA_Type = postData['type'];

    // localStorage.setItem('downloadInfo',)

    console.log('[do_ota]  OTA_Type =  ', OTA_Type);
    // console.log('[do_ota]  isOtaDownloadByPhone =', isOtaDownloadByPhone);

    if (OTA_Type == UpdateType.USB) { // [20200908] Zane: Unknown Part
        doUsbOta();
    } else {
        response['available'] = true; // Not Used?
        sendWebsocketBroadcast(JSON.stringify(response));
        // downloadServerFile();
        // if (OTA_BRAND == 'bentley') {
            // let state = localStorage.getItem('ota_checking');   // [20200901]
            // if ( state == 'downloading' ) { // Is power off resume
            if (sc == undefined) {
                try {
                    postData['type'] = UpdateType.NO_NEED; // [20200922]
                    checkSyncTec();
                } catch (err) {
                    logger.e(`===== ERROR: [DO_OTA] RESUME ${err}`);
                }
            } else {
                doDownloadSyncTec();
            }
            // await sc.doDownload();
        // } else {
        //     testResume();
        // }

    }
    // if (isOtaDownloadByPhone == true) {
    //     console.log('[do_ota] isOtaDownloadByPhone = true!!!');
    //     isOtaDownloadByPhone = false;
    //     checkOtaType(postData['type']);
    // } else if (OTA_Type > 0) {
    //     response['available'] = true;
    //     sendWebsocketBroadcast(JSON.stringify(response));
    //     downloadServerFile();
    // } else {
    //     doUsbOta();
    // }
};

/**
 * Function: Recovery from local
 *
**/
async function update_bootfail_mcu(param) {
    // const child = executor('unzip /mnt/DATA/abupdate.zip -d /var/volatile/');
    const child = executor(`cp /cache/${otaLDROM} /cache/${otaAPROM} /var/volatile/`); // Using Backup MCU files
    // const child = Tool.executorCmd('unzip /mnt/DATA/abupdate.zip -d /var/volatile/');

    child.on('exit', async function(code) {
        console.log('== param : ', param);
        logger.d(`[BOOT FAIL] PARAM ${param}`);

        if (param == bootFailEnum.bootfailApRom) {
            upgradeStatus = upgradeStatusEnum.upgradeApRom;
            portWrite('CPU_MSG SUSPEND');
            await Tool.sleep(100);
            portWrite('UPGRADE APROM');

        } else if (param == bootFailEnum.bootfailLdRom) {
            upgradeStatus = upgradeStatusEnum.upgradeLdRom;
            portWrite('CPU_MSG SUSPEND');
            await Tool.sleep(100);
            portWrite('UPGRADE LDROM');
		}

        // doMcuOta(); // [20201016]
    });
};
/**
* Check install type (Integrate Sync-tec)
*/
async function doInstallType() {
    let cpu = (fs.existsSync(`${synctecPath}cache/${ota}`) && fs.existsSync(`${synctecPath}cache/${otaProp}`) ) ? true : false;
    let mcu = (fs.existsSync(`${synctecPath}cache/${otaLDROM}`) && fs.existsSync(`${synctecPath}cache/${otaAPROM}`) ) ? true : false;

    if (fs.existsSync(`${synctecPath}cache/UpdatesInfo.txt`)) { // [20201010]
        logger.i(`Updates Information Found`);
        try {
            let data = JSON.parse( fs.readFileSync(`${synctecPath}cache/UpdatesInfo.txt`) );
            let swInfo = JSON.parse( await Tool.getSoftwareInfo() );
            logger.i(`Current MCU: ${swInfo.mcu_version} New MCU: ${data.mcu_version}`);
            if (data.mcu_version == swInfo.mcu_version) { mcu = false; }
        } catch (err) {
            logger.e(`Updates Information ${err}`);
        }
    } else {
        logger.i(`Updates Information Not Found`);

    }

    if (cpu && mcu) {
        return UpdateType.ALL;
    } else if (cpu) {
        return UpdateType.CPU;
    } else if (mcu) {
        return UpdateType.MCU;
    } return UpdateType.NO_NEED;
}

/**
* Do Installation
* @param {integer} type
*/
async function doInstallation(type) {
    logger.i(`Installation Start`);
    if (type == UpdateType.CPU || type == UpdateType.ALL) {
        localStorage.setItem('installing', 'CPU');
        try {
            const child = executor(`/usr/bin/byoc_webserver/imtester.sh ${unpackPath}${otaProp} ${unpackPath}${ota}`);

            child.stdout.on('data', async function(data) {
                console.log('data:-- ', data);
                sendCpuProgress(data);
            });

            child.on('exit', async function(code) {
                const updateInfo = {};
                console.log('code =', code);
                fs.readFile('/proc/cmdline', (err, data) => {
                    // Analyze abupdate is success or not
                    console.log('dta', data);
                    const stringData = data.toString();

                    // const updateType = stringData.slice(stringData.length-2, stringData.length-1);
                    const updateType = stringData.match(/androidboot.slot_suffix=_[ab]/g)[0].replace('androidboot.slot_suffix=_', ''); // [20200925] Zane: String changed on R8.6.4 (New BL2)
                    updateInfo['ota_type'] = updateType;
                    const content = JSON.stringify(updateInfo);

                    fs.writeFile('/data/otaType.json', content, async function(err) {
                        if (err) {
                            if (fs.existsSync('/data/otaType.json')) {
                                logger.e('===== ERROR: [OTA CPU 1] DELETE SLOT RECORD');
                                fs.unlink('/data/otaType.json');
                            }
                            // WifiTool.wifi_on_off(true); // [20201014]
                            return logger.e(`===== ERROR: [OTA CPU 2] OTA CPU ${err}`);
                        }
                        logger.i('========== SUCCESS: CPU UPDATED');
                        if (type == UpdateType.CPU) {
                            showRebootMessage();
                            reboot();
                        } else {
                            logger.i('========== SUCCESS: NEXT LEVEL: MCU LDROM');
                            await Tool.executorCmd(`cp ${unpackPath}${otaLDROM} ${unpackPath}${otaAPROM} /cache/`); // Backup MCU files
                            await Tool.executorCmd(`cp /cache/${otaLDROM} /cache/${otaAPROM} /var/volatile/`);
                            // await Tool.executorCmd(`sync /cache/`); // [20200905]
                            await Tool.executorCmd('sync');
                            localStorage.setItem('installing', 'MCU');
                            portWrite('CPU_MSG SUSPEND');
                            upgradeStatus = upgradeStatusEnum.upgradeLdRom;
                            await Tool.sleep(100);
                            portWrite('UPGRADE LDROM');
                            sendWebsocketBroadcast(JSON.stringify({
                                    task: 'update_progress', action: 'mcu_progress', progress: 0,
                            }));
                        }
                    });
                });
            });
        } catch (err) {
            logger.e(`Installation Failed ${err}`);
        }
    } else if (type == UpdateType.MCU) {
        await Tool.executorCmd(`cp ${unpackPath}${otaLDROM} ${unpackPath}${otaAPROM} /cache/`); // Backup MCU files
        // await Tool.executorCmd(`sync /cache/`); // [20200905]
        await Tool.executorCmd('sync');
        const child = executor(`cp /cache/${otaLDROM} /cache/${otaAPROM} /var/volatile/`);
        localStorage.setItem('installing', 'MCU');
        child.on('exit', async function(code) {
            portWrite('CPU_MSG SUSPEND');
            upgradeStatus = upgradeStatusEnum.upgradeLdRom;
            await Tool.sleep(100);
            portWrite('UPGRADE LDROM');
            sendWebsocketBroadcast(JSON.stringify({
                    task: 'update_progress', action: 'mcu_progress', progress: 0,
            }));
        });
    } else if (type == UpdateType.USB) {
        doUsbCpuOta();
    } else {
        logger.i('========== INFO: checkOtaType: TYPE UNKNOWN');
        showRebootMessage();
        reboot();
    }
}

async function usbMcuAvailable() {
    const response = {};
    try {
        const usbPath = await fetchMountPoint();
        const available = fs.existsSync(usbPath + '/' + otaLDROM);
        const apAvailable = fs.existsSync(usbPath + '/' + otaAPROM);

        response['available'] = available;
        console.log('McuAvailable Update Start = ', available);
        localStorage.setItem('installing', 'MCU');

        if (available == true && apAvailable == true) {
            await Tool.executorCmd(`cp ${usbPath + '/' + otaLDROM} ${usbPath + '/' + otaAPROM} /cache/`); // Backup MCU files
            // await Tool.executorCmd(`sync /cache/`); // [20200905]
            await Tool.executorCmd('sync');
            portWrite('CPU_MSG SUSPEND');
            upgradeStatus = upgradeStatusEnum.upgradeLdRom;
            await Tool.sleep(100);
            portWrite('UPGRADE LDROM');
            // upgradeStatus = upgradeStatusEnum.upgradeLdRom;
            sendWebsocketBroadcast(JSON.stringify({
                'task': 'update_progress',
                'action': 'mcu_progress',
                'progress': 0,
            }));
        } else if (apAvailable == true) {
            await Tool.executorCmd(`cp ${usbPath + '/' + otaAPROM} /cache/`); // Backup MCU files
            // await Tool.executorCmd(`sync /cache/`); // [20200905]
            await Tool.executorCmd('sync');
            portWrite('CPU_MSG SUSPEND');
            upgradeStatus = upgradeStatusEnum.upgradeApRom;
            await Tool.sleep(100);
            portWrite('UPGRADE APROM');
            // upgradeStatus = upgradeStatusEnum.upgradeApRom;
        } else {
            logger.e(`===== ERROR: [USB MCU 1] USB MCU NOT AVAILABLE`);
            sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200813] Zane: Use Failed MSG to HMI
            WifiTool.wifi_on_off(true); // [20201014]
            // showRebootMessage(); // [20201015]
            // reboot();
            // setTimeout(reboot, delayForMessage);
        }
    } catch (err) {
        logger.e(`===== ERROR: [USB MCU 2] USB MCU NOT AVAILABLE: ERR: ${err}`);
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200813] Zane: Use Failed MSG to HMI
        WifiTool.wifi_on_off(true); // [20201014]
        // showRebootMessage(); // [20201015]
        // reboot();
        // setTimeout(reboot, delayForMessage);
        response['available'] = false;
        response['err'] = err;
        winston.error(err);
    }
};

/**
 * Function: Do MCU update procedure
 * Parameter: param(unknown) [mcu_communication use]
 *            res(abandon?)
**/
// async function doMcuOta(param, res) {
async function doMcuOta(param) {
	// const response = {};
	let usbPath = '';
	let fileSize = 0;
	counter = start = end = 0;

	try {
		/* Read from local (CPU/MCU/ALL OTA FILE) */
		if (OTA_Type > UpdateType.USB) {
			console.log('doMcuOta => /data');
            usbPath = '/var/volatile';
		/* Read from USB */
		} else {
			console.log('doMcuOta => fetchMountPoint');
			usbPath = await fetchMountPoint();
		}

		if (param === 'UPGRADE START LDROM') { // Judge update file from MCU
			upgradeStatus = upgradeStatusEnum.upgradeLdRom;
			mcuota = otaLDROM;
		} else if (param === 'UPGRADE START APROM') {
			upgradeStatus == upgradeStatusEnum.upgradeApRom;
			mcuota = otaAPROM;
		} else { // Judge by upgradeStatus when MCU is not
			if (upgradeStatus == upgradeStatusEnum.upgradeLdRom) {
				mcuota = otaLDROM;
			} else {
				mcuota = otaAPROM;
			}
		}

	} catch (err) {
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200813] Zane: Use Failed MSG to HMI
        WifiTool.wifi_on_off(true); // [20201014]
        logger.e(`===== ERROR: [DO 1] MCU UPDATE FILE NOT FOUND`);
        // showRebootMessage(); // [20201015]
        // reboot();
		// showRebootMessage(); /* [20200716] Zane: ERR caught but send success?*/
		// setTimeout(reboot, delayForMessage);
		// response['mcu_update_status'] = false;
		// response['err'] = 'mcu OTA file does not exist';
		winston.error(err);
		return;
	}

	if (!fs.existsSync(usbPath + '/' + mcuota)) {
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200813] Zane: Use Failed MSG to HMI
        WifiTool.wifi_on_off(true); // [20201014]
        logger.e(`===== ERROR: [DO 2] MCU UPDATE FILE NOT FOUND`);
        // showRebootMessage(); // [20201015]
        // reboot();
		// showRebootMessage(); /* [20200716] Zane: ERR caught but send success?*/
		// setTimeout(reboot, delayForMessage);
		// response['update_status'] = false;
		// response['err'] = 'mcu OTA file does not exist';
		return;
	}

	fileSize = getFilesizeInBytes(usbPath + '/' + mcuota);
	fileend = fileSize;
	console.log('fileSize :', fileSize);
	page = parseInt(fileSize / 256) + 1;
	console.log('page :', page);

	fs.readFile(usbPath + '/'+ mcuota, (err, data) => {
		if (err) throw err;

		console.log(data);

		const dataBuf = data.slice(0, 256);
		const startBuf = stringtoHex('UPGRADE PAGE=' + counter.toString(16).padStart(2, '0') + ' ', true);
		const endBuf = Buffer.from(mcuChecksum(dataBuf) + '0d0a', 'hex');
		const arr = [startBuf, dataBuf, endBuf];

		portcpuWrite(Buffer.concat(arr));
	});
};

/**
 * Function: Do MCU update (data transfer)
 * Parameter: param(unknown) [mcu_communication use]
 *            res(abandon?)
**/
async function do_mcuota_transfer_next(param, res) {
    console.log(`===== INFO: TRANSFER NEXT START`);
    // [20200814] Zane: Received NEXT from MCU, If last page sent and Received this, means MCU checksum OK then send finish to MCU
    if (fileend <= start) {
        portWrite('UPGRADE FINISH'); // [20200814] Zane: file end then send finish to MCU
		// doMcuFinish();
		return;
    }

    let usbPath = '';
    try {
		if (OTA_Type > UpdateType.USB) {
			usbPath = '/var/volatile';
		} else {
			usbPath = await fetchMountPoint();
		}
		if (upgradeStatus == upgradeStatusEnum.upgradeLdRom) {
			mcuota = otaLDROM;
		} else {
			mcuota = otaAPROM;
		}
    } catch (err) {
        sendWebsocketBroadcast(JSON.stringify( {task: 'update_state', action: 'failed'} )); // [20200813] Zane: Use Failed MSG to HMI
        WifiTool.wifi_on_off(true); // [20201014]
        logger.e(`===== ERROR: [NEXT] MCU UPDATE FILE NOT FOUND`);
        // showRebootMessage(); // [20201015]
        // reboot();
		// response['mcu_update_status'] = false;
		// response['err'] = 'mcu OTA file does not exist';
		winston.error(err);
		return;
    }
    counter++;
    console.log('counter : ' + counter);

    fs.readFile(usbPath + '/' + mcuota, (err, data) => {
		if (err) throw err;

		start += 256;
		const sliceEnd = (start + 256) >= fileend ? fileend : (start + 256); // [20200815] Zane: use to calc 256 bytes over file size
		let tmpSlice = data.slice(start, sliceEnd);
		const endBuf = Buffer.from(mcuChecksum(data.slice(start, sliceEnd)) +
			'0d0a', 'hex');
        console.log(`===== INFO: TRANSFER NEXT: START ${start} END ${sliceEnd}`);
        console.log(`===== INFO: TRANSFER NEXT: SLICE ${tmpSlice.toString('hex')} ENDBUF ${endBuf.toString('hex')}`);
		if ((start + 256) >= fileend) {
			tmpSlice = Buffer.concat([tmpSlice,
            Buffer.alloc(256 - (fileend - start))]);
            start += 256; // [20200815] Zane: Over file size, then add first to avoid next round error. can use flag too.
            console.log(`===== INFO: TRANSFER NEXT: OVER fileend change tmpslice ${tmpSlice.toString('hex')}`);
		}

		console.log('Checksum : ' + mcuChecksum(tmpSlice));

		const startBuf = stringtoHex('UPGRADE PAGE=' + counter.toString(16).padStart(2, '0') + ' ', true);
        const arr = [startBuf, tmpSlice, endBuf];
        console.log(`===== INFO: TRANSFER NEXT: StartBuf ${startBuf.toString('hex')}`);

		portcpuWrite(Buffer.concat(arr));
        console.log(`===== INFO: TRANSFER NEXT END`);
    });
};

/**
 * Function: Do MCU update (data transfer)
 * Parameter: param(unknown) [mcu_communication use]
 *            res(abandon?)
**/
// async function do_mcuota_transfer_resend(param, res) {
async function do_mcuota_transfer_resend(param) {
    console.log(`===== INFO: TRANSFER RESEND START`);
    // [20200814] Zane: If MCU checksum error, do resend may not have fileend condition, try to coordinates data (Maybe Bug Here)
    if (fileend <= start) {
        portWrite('UPGRADE FINISH'); // [20200814] Zane: file end then send finish to MCU
		// doMcuFinish();
		return;
	}

    let usbPath = '';
    if (OTA_Type > UpdateType.USB) {
      	usbPath = '/var/volatile';
    } else {
      	usbPath = await fetchMountPoint();
	}

    counter = param;
    fs.readFile(usbPath + '/' + mcuota, (err, data) => {
		if (err) throw err;

		console.log('[do_mcuota_transfer_resend] counter : ', counter);

		if ( counter * 256 < fileend ) {
			start = counter * 256;
		}

		if (page == counter) {
			start = (page -1) *256;
		}

		const sliceEnd = (start + 256) >= fileend ? fileend : (start + 256);
		let tmpSlice = data.slice(start, sliceEnd);
		const endBuf = Buffer.from(mcuChecksum(data.slice(start, sliceEnd)) +
			'0d0a', 'hex');

		if ((start + 256) >= fileend) {
			tmpSlice = Buffer.concat([tmpSlice,
			Buffer.alloc(256 - (fileend - start))]);
        }

        console.log('Checksum : ' + mcuChecksum(tmpSlice));

		const startBuf = stringtoHex('UPGRADE PAGE=' + counter.toString(16).padStart(2, '0') + ' ', true);
		const arr = [startBuf, tmpSlice, endBuf];

		portcpuWrite(Buffer.concat(arr));
        console.log(`===== INFO: TRANSFER RESEND END`);
    });
};
/**
 * Function: Do MCU update finish
 * Parameter: param(unknown) [mcu_communication use]
 *            res(abandon?)
**/
async function doMcuFinish(param, res) {
    logger.i('doMcuFinish, upgradeStatus', upgradeStatus);
    const msg = {
        task: 'update_progress',
        action: 'mcu_progress',
        progress: 0};
    if (upgradeStatus == upgradeStatusEnum.upgradeLdRom) {
        upgradeStatus = upgradeStatusEnum.upgradeApRom;
        // portWrite('UPGRADE FINISH');
        // Tool.sleep(100);
        portWrite('UPGRADE APROM');
        msg.progress = 50;
        logger.i('========== SUCCESS: MCU LDROM UPDATED, NEXT LEVEL: APROM');
    } else if (upgradeStatus == upgradeStatusEnum.upgradeApRom) {
        // portWrite('UPGRADE FINISH');
        upgradeStatus = upgradeStatusEnum.bootMcu;
        msg.progress = 100;
        logger.i('========== SUCCESS: MCU APROM UPDATED');
    } else {
        logger.i('========== SUCCESS: MCU UPDATED');
        // localStorage.setItem('ota_checking', 'installed');
        if (fs.existsSync(versionNode)) {
            const rawdata = fs.readFileSync(versionNode);
            const prettify = JSON.parse(rawdata);
            localStorage.setItem('mcu_version', prettify.mcu_version);
        }
        showRebootMessage();
        reboot();
        msg.progress = 100; // return; // [20200813] Zane: return here or kept 100 to avoid installed 0%
        // if (fs.existsSync('/mnt/DATA/abupdate.zip')) {
        //   fs.unlinkSync('/mnt/DATA/abupdate.zip', function() {
        //     setTimeout(deleteOtaFile, 5000);
        //   });
        // }
        // setTimeout(deleteOtaFile, 5000);
    }
    sendWebsocketBroadcast(JSON.stringify(msg));
};

function is_insert_usb(param, res) {
  fetchMountPoint().then(function(data) {
    if (data == '') {
      res('Fail');
    } else {
      res('Ready');
    }
  }).catch(function(err) {
    res('Fail');
  });
};

function package_log_file(param, res) {
	console.log("=====in package_log_file=====")
	console.log("log_file param = ",param)
	console.log("log_file res = ",JSON.stringify(res) )
	

	const catchKernel = 'journalctl -a -t kernel > /mnt/DATA/webserver/journal/journalctl_kernel.log';
	const catchNode = 'journalctl -a -t node > /mnt/DATA/webserver/journal/journalctl_node.log';
	const catchBt = 'journalctl -a -t anwbtapid > /mnt/DATA/webserver/journal/journalctl_anwbt.log';
	const catchMgr = 'journalctl -a >/mnt/DATA/webserver/journal/journal_all.log';
	const catchGst = 'journalctl -a -t jetgstmgr >/mnt/DATA/webserver/journal/journalctl_gstMgr.log';
	const catchAir = 'journalctl -a -t airservercast > /mnt/DATA/webserver/journal/journalctl_airserver.log';
	const macInfo = 'ifconfig -a > /mnt/DATA/webserver/macInfo';
    const cpVersion = 'cp  /data/*.json /mnt/DATA/webserver/';
    const cpPersist = 'cp /data/*.txt /mnt/DATA/webserver/'; // [012921]
    const catchOTA = 'cp -r /cache/logs/ /mnt/DATA/webserver/';  // [20201006]
    const pstore = ' /sys/fs/pstore/ ';
    const tarCmd = 'tar -cvOf /mnt/DATA/log.tar' + pstore +
    ' /var/log/* /tmp/ /mnt/DATA/webserver/* && echo "finish"';
    eventEmitter.emit(Const.TIMER_HANDLE, {enable: false});
    eventEmitter.emit(Const.SCREEN_TIMEOUT_STOP);
    Tool.executorCmd('sync');
    Tool.executorCmd(catchKernel)
    .then(()=>{
        return Tool.executorCmd(catchNode);
    }).then(()=>{
        return Tool.executorCmd(catchBt);
    }).then(()=>{
        return Tool.executorCmd(catchGst);
    }).then(()=>{
        return Tool.executorCmd(catchAir);
    }).then(()=>{
        return Tool.executorCmd(catchMgr);
    }).then(()=>{
        return Tool.executorCmd(cpVersion);
    }).then(()=>{
        return Tool.executorCmd(cpPersist);
    }).then(()=>{
        if (fs.existsSync('/cache/logs/')) {
            return Tool.executorCmd(catchOTA);
        } else { return; }
    }).then(()=>{
        return Tool.executorCmd(macInfo);
    }).then(()=>{
        return Tool.getBtMacAddress();
    }).then((btMac)=>{
        return Tool.executorCmd(`echo ${btMac} >> /mnt/DATA/webserver/macInfo && sync`)
    }).then( ()=>{
        return Tool.executorTarCmd(tarCmd);
    }).then(()=>{
        moveToUSB(res)
    }).catch(()=>{
        moveToUSB(res)
    });
};

function moveToUSB(res) {
    const copyLogToSDCard = 'mv /mnt/DATA/log.tar ';
    fetchMountPoint().then((usbPath)=>{
        if (usbPath !== undefined) {
            Tool.executorTarCmd(copyLogToSDCard + ' \"' + usbPath +
            '/$(date +%Y%m%d_%H%M%S).tar\" && sync && echo "finish"').then(()=>{
                res();
                eventEmitter.emit(Const.TIMER_HANDLE, {enable: true});
                eventEmitter.emit(Const.SCREEN_TIMEOUT_CHANGE);
            }).catch(()=>{
                res();
                eventEmitter.emit(Const.TIMER_HANDLE, {enable: true});
                eventEmitter.emit(Const.SCREEN_TIMEOUT_CHANGE);
            });
        } else {
            console.log('usb not found');
            res();
            eventEmitter.emit(Const.TIMER_HANDLE, {enable: true});
            eventEmitter.emit(Const.SCREEN_TIMEOUT_CHANGE);
        }
    }).catch((err)=>{
        console.log(err);
        res();
        eventEmitter.emit(Const.TIMER_HANDLE, {enable: true});
        eventEmitter.emit(Const.SCREEN_TIMEOUT_CHANGE);
    });
};

async function package_screenshots(param, res) {
  const tarCmd = 'tar -cvOf /mnt/DATA/screenshots.tar' +  ' /tmp/screen_dump*';
  console.log(tarCmd);
  const copyLogToSDCard = 'mv /mnt/DATA/screenshots.tar ';
  try {
    const usbPath = await fetchMountPoint();
    Tool.executorCmd(tarCmd)
    .then(()=>{
      return Tool.executorCmd(copyLogToSDCard + usbPath +' && sync');
    }).then(()=>{
      res();
    }).catch(async (e)=>{
      winston.error(e);
      await Tool.executorCmd(`echo 'no screenshot file, screen dump will be removed after reboot'> /tmp/screen_dump_not_exist.txt`);
      await Tool.executorCmd(tarCmd).catch(()=>{
          //ignore  removing leading '/' from member names
          Tool.executorCmd(copyLogToSDCard + usbPath + '/screenshots_$(date +%Y%m%d_%H%M%S).tar'
            + ' && sync').then(()=>{
            res();
          }).catch(res());
      });
    });
  } catch (err) {
    winston.info(err);
    res();
  }
};

function screenshot(param, res) {
//   executor('weston-simple-screenshooter-mtk');
  Tool.executorCmd('weston-simple-screenshooter-mtk');
  res();
}

/**
 * Send progress
 * @param {string} data
 */
function sendCpuProgress(data) {
    if (/overall progress/.test(data)) {
        const match = data.match(/\d+%/g);
        const value = match[match.length -1].replace('%', '');
        sendWebsocketBroadcast(JSON.stringify({
                task: 'update_progress', action: 'cpu_progress', progress: value
        }));
    }
}

/**
 * Function: Check for update triggered. [server.js]
**/
async function usb_ota_server_available() {
    usbOtaAvailable();
    //   res({});
};

function mcuUpgradeType(param) {
	upgradeStatus = param;
};

function otaUpdateType(param) {
	OTA_Type = param;
};

function getProgress() {
    try {
        const msg = {
            'task': 'ota_download_progress',
            'action': 'update_progress',
            // 'progress': progressCnt,
            // 'progress': (OTA_BRAND == 'bentley') ? demo_platform.progressCNT : progressCnt, // Sync-tec
            'progress': demo_platform.progressCNT
        };
        sendWebsocketBroadcast(JSON.stringify(msg)); /* To UI progressbar */
    } catch (err) {
        console.log("getProgress:" + err);
    }
}

module.exports = {
	// checkOtaType : checkOtaType,
	update_bootfail_mcu : update_bootfail_mcu,
	// setMCUUpgradeType : setMCUUpgradeType,
	mcuUpgradeType : mcuUpgradeType,
	// setOTAUpdateType : setOTAUpdateType,
	otaUpdateType : otaUpdateType,

	/* Something using these two function(Sys freeze) */
	is_insert_usb : is_insert_usb,
	screenshot: screenshot,

	// otaTypeUpdate : otaTypeUpdate,

	getProgress: getProgress,

	/* ASYNC FUNCTION */
	do_ota : do_ota,
	usb_ota_server_available : usb_ota_server_available,
	usb_ota_mcu_available : usb_ota_mcu_available,
	usbMcuAvailable : usbMcuAvailable,
	doMcuOta : doMcuOta,
	do_mcuota_transfer_next : do_mcuota_transfer_next,
	do_mcuota_transfer_resend: do_mcuota_transfer_resend,
	doMcuFinish : doMcuFinish,
	package_log_file : package_log_file,
	package_screenshots : package_screenshots,
};