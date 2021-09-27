


@ECHO off
CLS
@REM ECHO Date format = %date%

REM Breaking down the format 
@REM FOR /f "tokens=2 delims==" %%G in ('wmic os get localdatetime /value') do set datetime=%%G
@REM ECHO dd = %datetime:~6,2%
@REM ECHO mth = %datetime:~4,2% 
@REM ECHO yyyy = %datetime:~0,4%
@REM ECHO/
@REM ECHO Time format = %time%
@REM ECHO hh = %time:~0,2%
@REM ECHO mm = %time:~3,2%
@REM ECHO ss = %time:~6,2%
@REM ECHO/

FOR /f "tokens=2 delims==" %%G in ('wmic os get localdatetime /value') do set datetime=%%G
SET dd = %datetime:~6,2%
SET mth = %datetime:~4,2% 
SET yyyy = %datetime:~0,4%

SET Time format = %time%
SET hh = %time:~0,2%
SET mm = %time:~3,2%
SET ss = %time:~6,2%





REM Variable format 1
SET Timestamp=%date:~6,8%-%date:~3,2%-%date:~0,2%_%time:~0,2%:%time:~3,2%:%time:~6,2%
@REM ECHO New Format 1: %Timestamp%
ECHO/
REM Variable Format 2
SET Timestamp=%date:~6,8%%date:~3,2%%date:~0,2%%time:~0,2%%time:~3,2%%time:~6,2%
@REM ECHO New Format 2: %Timestamp%
ECHO/
REM Building a timestamp from variables
SET "dd=%datetime:~6,2%"
SET "mth=%datetime:~4,2%"
SET "yyyy=%datetime:~0,4%"
set  "hh=%time:~0,2%"
set  "mm=%time:~3,2%"
set  "ss=%time:~6,2%"

SET "Date=%yyyy%_%mth%_%dd%_%hh%-%mm%-%ss%"
ECHO Built Date from variables: %Date%
ECHO/

del /f log.tar
adb shell "node /usr/bin/byoc_webserver/peckage_log.js"
adb pull /mnt/DATA/log.tar

REM Write Timestamp into file name


copy "log.tar"  "%Date%.tar"
@REM copy "log.tar" "fuck.tar"


PAUSE
