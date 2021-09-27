const { exec } = require('child_process');
const fs=require('fs')
// exec('"/path/to/test file/test.sh" arg1 arg2');



function package_log_file() {
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
    const btMac =3
    // eventEmitter.emit(Const.TIMER_HANDLE, {enable: false});
    // eventEmitter.emit(Const.SCREEN_TIMEOUT_STOP);
    exec('sync');

    exec(`${catchNode} && ${catchBt} && ${catchGst} && ${catchAir}
    && ${catchMgr} $$ ${cpPersist} $$ sleep 1`)

    if (fs.existsSync('/cache/logs/')) {
        exec("sleep 2 && "+catchOTA);

    }

    exec(`sleep 4 && ${macInfo} && echo ${btMac} >> /mnt/DATA/webserver/macInfo && sync && ${tarCmd} && sync`)

/*    
    exec(catchKernel)
    .then(()=>{
        console.log(exec)
        exec(catchNode);
    }).then(()=>{
        exec(catchBt);
    }).then(()=>{
        exec(catchGst);
    }).then(()=>{
        exec(catchAir);
    }).then(()=>{
        exec(catchMgr);
    }).then(()=>{
        exec(cpVersion);
    }).then(()=>{
        exec(cpPersist);
    }).then(()=>{
        if (fs.existsSync('/cache/logs/')) {
            exec(catchOTA);
        } else { return; }
    }).then(()=>{
        exec(macInfo);
    }).then(()=>{
        return Tool.getBtMacAddress();
    }).then((btMac)=>{
        exec(`echo ${btMac} >> /mnt/DATA/webserver/macInfo && sync`)
    }).then( ()=>{
        return Tool.executorTarCmd(tarCmd);
    }).then(()=>{
        // moveToUSB(res)
    }).catch(()=>{
        // moveToUSB(res)
    });
    */

};


package_log_file()