adb push .\peckage_log.js /usr/bin/byoc_webserver
timeout /t 1
@REM adb push .\usb_ctrl.js /usr/bin/byoc_webserver
adb shell " sync && reboot "
@REM timeout /t 60
@REM adb shell " journalctl -f |grep "log_file" "