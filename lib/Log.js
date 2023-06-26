const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { Severity } = require("./../lib/syslog-client");
const path = require("path");

const { createWriteStream, existsSync, mkdirSync, rmSync, unlinkSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync, writeFileSync, writeFile } = require("fs");
//const fs = require('fs/promises');

let _logBooks;
let _logApps;
let _logHostnames;
let _logCount;

let _filePath;
let _logfile, _appsFile, _hostnamesFile, _countFile;
const APP_NAME = 'Simple Log';


const F_OK = 0;
const R_OK = 4;
const W_OK = 2;
const X_OK = 1;


const SEVERITIES = {
    '0': 'Emergency',
    '1': 'Alert',
    '2': 'Critical',
    '3': 'Error',
    '4': 'Warning',
    '5': 'Notice',
    '6': 'Info',
    '7': 'Debug'
};
const FACILITIES = {
    '0': 'Kernel',
    '1': 'User',
    '3': 'System',
    '13': 'Audit',
    '14': 'Alert',
    '16': 'Flow',
    '17': 'Device',
    '18': 'App',
    '19': 'Scene',
    '20': 'Trigger',
    '21': 'Condition',
    '22': 'Action',
    '23': 'Local7'
};
function substring(str, start, end) {
    return !str ? str : str.substring(start, end);
    if (!str) return str;
    let s = '', d, _end = (end || str.length);
    while (start < _end) {
        s += str.substring(start, start + (d = (d = _end - start) > 12 ? 12 : d));
        start += d;
    }
    return s;
}



class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    get LogApps() { if (!_logApps) _logApps = []; return _logApps; }
    get LogHostnames() { if (!_logHostnames) _logHostnames = []; return _logHostnames; }

    get logCount() { if (!_logCount) _logCount = 0; return _logCount; }
    set logCount(value) {
        if (!_logCount) _logCount = 0; _logCount = value;
        // try {
        //     this.countStream.write(_logCount.toString());
        //     //writeFileSync(_countFile, _logCount.toString(), { encoding:'utf8', flag:'w'});
        // } catch (error) {

        // }

        return _logCount;
    }

    constructor({ filePath }) {
        _filePath = filePath;
        _logfile = filePath + 'log.index';
        _appsFile = filePath + 'log.apps';
        _hostnamesFile = filePath + 'log.hostnames';
        _countFile = filePath + 'log.count';

    }
    async init() {
        _logBooks = {};
        _logApps = [];
        _logHostnames = [];
        _logCount = 0;

        let logs;
        //if (existsSync(_logfile)) logs = readFileSync(_logfile);
        try {
            //await fs.access(_logfile, R_OK);
            //logs = await fs.readFile(_logfile);
            logs = readFileSync(_logfile, { encoding: 'utf8' });
        } catch (error) {
            //BL.homey.error(error);
        }
        if (logs) {
            let logRows = logs.split('\n');
            for (let i = 0; i < logRows.length - 1; i++) {
                const logRow = logRows[i];
                try {

                    let log = JSON.parse(`{${logRow.replace('f:', '"file":').replace('d:', '"date":')}}`);
                    log.date = new Date(log.date);
                    log.file = _filePath + log.file;
                    log.path = _filePath;
                    let logDate = this.getLogBookDate(log.date);
                    log.id = logDate;
                    this.LogBooks[logDate] = new LogBook(log);
                } catch (error) {
                    BL.homey.error('Log.init error logRow: ', logRow, error);
                }
            }
        }
        let apps;
        try {
            apps = readFileSync(_appsFile);
        }
        catch (ex) { }
        if (apps) {
            let appRows = apps.toString('utf8').split('\n');
            _logApps = appRows;
        }
        let hostnames;
        try {
            hostnames = readFileSync(_hostnamesFile);
        }
        catch (ex) { }
        if (hostnames) {
            let hostnameRows = hostnames.toString('utf8').split('\n');
            _logHostnames = hostnameRows;
        }

        let counts = 0;
        try {
            counts = readFileSync(_countFile);
        }
        catch (ex) { }
        if (counts) {
            _logCount = counts.toString('utf8').length;
        }
        this.stream = createWriteStream(_logfile, { flags: 'a', autoClose: true, });
        this.appsStream = createWriteStream(_appsFile, { flags: 'a', autoClose: true, });
        this.hostnameStream = createWriteStream(_hostnamesFile, { flags: 'a', autoClose: true, });
        this.countStream = createWriteStream(_countFile, { flags: 'a', autoClose: true, });
        //this.countStream.write(counts.toString());

    }
    async destroy() {
        for (let i = 0; i < this.LogBooks.length; i++) {
            const logBook = this.LogBooks[i];
            await logBook.destroy();
        }
        _logBooks = [];

        if (this.stream) try {
            this.stream.destroy();
            this.stream = null;
        } catch (error) { }

        if (this.appsStream) try {
            this.appsStream.destroy();
            this.appsStream = null;
        } catch (error) { }

        if (this.hostnameStream) try {
            this.hostnameStream.destroy();
            this.hostnameStream = null;
        } catch (error) { }
    }

    async clearLog(days) {
        if (days) {
            let date = new Date(); date = date.setDate(date.getDate() - (days + 1));
            let logbookDelete = false;
            let linesDeleted = 0;
            let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                const logBook = this.LogBooks[logBookKey];
                if (logBook.date <= date) {
                    logbookDelete = true;
                    let linesCounter = readFileSync(logBook.file + '.index').toString('utf8');
                    linesDeleted += (linesCounter.match(/\n/g) || '').length;
                    try { unlinkSync(logBook.file + '.index'); } catch (ex) {
                        //this.error(ex);
                    }
                    try { unlinkSync(logBook.file + '.log'); } catch (ex) {
                        //this.error(ex);
                    }
                    delete this.LogBooks[logBookKey];
                }
                await logBook.destroy();
            }
            if (logbookDelete === true) {
                if (this.stream) this.stream.destroy();
                //unlinkSync(_logfile);
                this.stream = createWriteStream(_logfile, { flags: 'w', autoClose: true, });
                keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'asc');
                for (let i = 0; i < keys.length; i++) {
                    const logBookKey = keys[i];
                    const logBook = this.LogBooks[logBookKey];
                    if (this.stream) this.stream.write(`f:${JSON.stringify(logBook.id)},d:${logBook.date.getTime()}\n`);
                }
                if(this.countStream ) this.countStream.destroy();                    
                 this.countStream = createWriteStream(_countFile, { flags: 'w', autoClose: true, });
                 this.logCount-=linesDeleted;
                 this.countStream.write("".padStart(this.logCount, " "));
                
                if (logbookDelete === true) this.writeLine({ message: "Removed log data older then " + days + " Day(s)", app: "Simple Log" });
            }
        } else {
            let items;
            try {
                items = readdirSync(_filePath);
            } catch (error) {

            }
            if (items) for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const f = path.join(_filePath, item);
                let stat = statSync(f);
                if (stat.isDirectory()) {
                    try { rmSync(f, { recursive: true, force: true }); } catch (ex) {

                        this.error(ex);
                    }
                } else if (stat.isFile()) {
                    try { unlinkSync(f); } catch (ex) {
                        this.error(ex);
                    }
                }
            }
            for (let i = 0; i < this.LogBooks.length; i++) {
                const logBook = this.LogBooks[i];
                logBook.destroy();
            }
            await this.init();
            this.writeLine({ message: "Cleared all logging data", app: "Simple Log" });
        }
    }

    async getLogs({ severity, facility, hostname, app, message, timestamp_fromUTC, timestamp_toUTC, skip, take, maxSizeKb, lastLog, timestampFormat, returnType } = {}) {
        try {

            let logs = [];
            let opts = BL._.cloneDeep(arguments[0]) || {};
            if (opts.timestamp_fromUTC) {
                opts.timestamp_fromUTC = new Date(opts.timestamp_fromUTC);
                opts.timestamp_fromUTC = BL.datetime.asLocale(opts.timestamp_fromUTC);
            }
            if (opts.timestamp_toUTC) {
                opts.timestamp_toUTC = new Date(opts.timestamp_toUTC);
                opts.timestamp_toUTC = BL.datetime.asLocale(opts.timestamp_toUTC);
                let t = new Date(opts.timestamp_toUTC.setDate(opts.timestamp_toUTC.getDate() + 1)); // till the end of the day
                opts.timestamp_toUTC = t;//new Date(t.setMilliseconds(t.getMilliseconds() - 1));
            }
            //return {logs, csv:''};
            try {

                if (app) {
                    opts.apps = [];
                    for (let i = 0; i < this.LogApps.length; i++)
                        if (this.LogApps[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.apps.push(i);
                }
                if (hostname) {
                    opts.hostnames = [];
                    for (let i = 0; i < this.LogHostnames.length; i++)
                        if (this.LogHostnames[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.hostnames.push(i);
                }
                let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
                let logId = lastLog ? lastLog.split('$')[0] : null;
                let logI = lastLog ? lastLog.split('$')[1] : null;
                let size = 0, dropped = 0;
                let justRun = logId ? false : true;
                if (logId) skip = 0;
                for (let i = 0; i < keys.length; i++) {
                    const logBookKey = keys[i];
                    if (logId && logId == logBookKey) justRun = true;
                    if (!justRun) continue;
                    const logBook = this.LogBooks[logBookKey];
                    if (opts.timestamp_fromUTC && logBook.date && logBook.date < opts.timestamp_fromUTC) break;
                    if (opts.timestamp_toUTC && logBook.date && logBook.date >= opts.timestamp_toUTC) continue;

                    let l;
                    //if (true) {
                    try {
                        l = await logBook.getLogs(opts);
                        //logBook.destroy();
                    } catch (error) {
                        BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                        continue;
                    }
                    for (let j = 0; j < l.length; j++)
                        (l[j].size = (this.roughSizeOfObject(l[j]) * 2));


                    //}
                    logs = logs.concat(l);

                    if (logId && logId == logBookKey) {
                        let ind = BL._.findIndex(logs, x => x.i == logI);
                        if (ind) logs = BL._.drop(logs, ind);
                    }

                    if (skip && dropped < skip) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        let toDrop = (skip - dropped);
                        if (logs.length >= toDrop) { dropped += toDrop; logs = BL._.drop(logs, toDrop); }// (dropped += toDrop));
                        else { dropped += logs.length; logs = []; }
                    }
                    if (take && logs.length >= take) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        logs.length = take;
                        break;
                    }

                    size = BL._.sumBy(logs, 'size');
                    if (maxSizeKb && size > maxSizeKb * 1000)
                        break;

                }
                logs = BL._.orderBy(logs, 'timestamp', 'desc');
                if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                if (take) logs = BL._.take(logs, take);

                //size = this.roughSizeOfObject(logs) * 2;
                size = BL._.sumBy(logs, 'size');

                if (maxSizeKb && size > maxSizeKb * 1000) {
                    let reduce = 1.0 / (maxSizeKb * 1000) * size;
                    logs = BL._.take(logs, logs.length / reduce);
                }
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    if (timestampFormat) log.timestamp_formatted = BL.datetime.toString(timestampFormat, log.timestamp);
                    delete log.size;
                }
                //BL.homey.log(this.roughSizeOfObject(logs));


            } catch (error) {
                BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
            }
            // BL.homey.log('roughSizeOfObject this.Log', this.roughSizeOfObject(this));
            // BL.homey.log('roughSizeOfObject this.Log.LogBooks', this.roughSizeOfObject(this.LogBooks));
            // BL.homey.log('roughSizeOfObject _logBooks', this.roughSizeOfObject(_logBooks));
            // BL.homey.log('roughSizeOfObject BL.homey.app', this.roughSizeOfObject(BL.homey.app));

            // Do this for all exports
            if (returnType)
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    log.severity = SEVERITIES[log.severity];
                    log.facility = FACILITIES[log.facility];
                }
            let result = {};
            switch (returnType) {
                case 'csv':
                case 'csv_base64':
                    //result.csv = await converter.json2csvAsync(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    result.csv = await BL.json.toCsv(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    if (maxSizeKb && result.csv.length > maxSizeKb) result.csv = substring(result.csv, 0, (maxSizeKb * 1000));
                    if (returnType == 'csv_base64') {
                        result.csv = Buffer.from(result.csv).toString('base64');
                    }
                    //delete result.logs;
                    break;
                case 'xlsx':
                case 'xlsx_base64':
                    let date = BL.json.exports.excel_defaultdateformat || 'yyyy-mm-dd hh:mm:ss';
                    let schema = [
                        {
                            column: BL.homey.__('Timestamp'),
                            type: Date,
                            format: date,
                            value: log => BL.datetime.toLocale(log.timestamp),
                            width: date.length //BL._.maxBy(logs, 'timestamp.length')
                        },
                        {
                            column: BL.homey.__('Severity'),
                            type: String,
                            value: log => log.severity,
                            width: BL._.max([BL._.max(BL._.map(logs, 'severity.length')), BL.homey.__('Severity').length])
                        },
                        {
                            column: BL.homey.__('Facility'),
                            type: String,
                            value: log => log.facility,
                            width: BL._.max([BL._.max(BL._.map(logs, 'facility.length')), BL.homey.__('Facility').length])
                        },
                        {
                            column: BL.homey.__('App'),
                            type: String,
                            value: log => log.app,
                            width: BL._.max([BL._.max(BL._.map(logs, 'app.length')), BL.homey.__('App').length])
                        },
                        {
                            column: BL.homey.__('Message'),
                            type: String,
                            value: log => log.message,
                            width: BL._.max([BL._.max(BL._.map(logs, 'message.length')), BL.homey.__('Message').length])
                        }
                    ];
                    if (BL.homey.app.settings.includeUtcInExcel) schema.unshift({
                        column: BL.homey.__('Timestamp') + ' (UTC)',
                        type: String,
                        value: log => log.timestamp ? log.timestamp.toISOString() : null,
                        width: new Date().toISOString().length // iso dates
                    });
                    let xlsxBuffer = await BL.json.toExcel(logs, {
                        schema,
                        sheet: 'Log',// + BL.datetime.toString('datetime'),
                        stickyRowsCount: 1,
                        buffer: true, //returnType == 'xlsx' ? true : false,
                        //dateFormat: 'yyyy-mm-ddThh:mm:ss'
                    });
                    result.xlsx = xlsxBuffer;
                    if (returnType == 'xlsx_base64') {
                        result.xlsx = Buffer.from(result.xlsx).toString('base64');
                    }
                    break;
                case 'json':
                case 'json_base64':
                    result.json = JSON.stringify(logs);
                    if (returnType == 'json_base64') {
                        result.json = Buffer.from(result.json).toString('base64');
                    }
                    break;
                default:
                    result.logs = logs;

                    break;
            }
            if(!severity && !facility && !hostname && !app && !message && !timestamp_fromUTC && !timestamp_toUTC) result.count = this.logCount;
            //BL.homey.settings.set()
            return result;

        } catch (error) {
            BL.homey.error(error);
            throw new Error(error);
        }
    }

    roughSizeOfObject(object) {

        let objectList = [];
        let stack = [object];
        let bytes = 0;

        while (stack.length) {
            let value = stack.pop();

            if (typeof value === 'boolean') {
                bytes += 4;
            }
            else if (typeof value === 'string') {
                bytes += value.length * 2;
            }
            else if (typeof value === 'number') {
                bytes += 8;
            }
            else if
                (
                typeof value === 'object' && objectList.indexOf(value) === -1
            ) {
                objectList.push(value);

                for (let i in value) {
                    stack.push(value[i]);
                }
            }
        }
        return bytes;
    }

    async writeLine({ message, severity, facility, hostname, timestamp = new Date(), app } = {}) {
        //return Promise.resolve();
        let opts = { message, severity, facility, hostname, timestamp: timestamp || new Date(), app }; //BL._.cloneDeep(...arguments);
        if (opts.app && opts.app.length > 100) throw new Error('App name must not be longer than 100 Characters.');
        if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        if (opts.app) {
            let i;
            if ((i = this.LogApps.indexOf(opts.app)) > -1) opts.app = i;
            else {
                this.appsStream.write(opts.app + '\n');
                this.LogApps.push(opts.app);
                opts.app = this.LogApps.length - 1;
            }
        }
        if (opts.hostname) {
            let i;
            if ((i = this.LogHostnames.indexOf(opts.hostname)) > -1) opts.hostname = i;
            else {
                this.hostnameStream.write(opts.hostname + '\n');
                this.LogHostnames.push(opts.hostname);
                opts.hostname = this.LogHostnames.length - 1;
            }
        }

        try {
            const r = this.getLogBook(opts.timestamp).writeLine(opts);
            this.logCount++;
            this.countStream.write(" ");
            return r;
        } catch (error) {
            BL.homey.error(error, 'opts', opts);
            throw new Error(error);
        }


        //if(this.stream) this.stream.write(JSON.stringify(arguments[0]) + '\r\n');
    }

    /**
     * 
     * @param {Date} date 
     * @returns 
     */
    getLogBookDate(date) {
        return `${date.getUTCFullYear()}/${(date.getUTCMonth() + 1).toString().padStart(2, '0')}/${date.getUTCDate().toString().padStart(2, '0')}`;
        return BL.datetime.toString('yyyy/MM/dd', date);
    }

    /**
     * 
     * @param {Date} date 
     * @returns 
     */
    getLogBook(date) {
        try {
            // let gmt = Number.parseInt(BL.datetime.toString('z', date));
            // date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), -gmt, 0, 0, 0);
            date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
            let logDate = this.getLogBookDate(date);
            if (!this.LogBooks[logDate]) {
                this.LogBooks[logDate] = new LogBook({ id: logDate, file: _filePath + logDate, date });
                if (this.stream) this.stream.write(`f:${JSON.stringify(logDate)},d:${date.getTime()}\n`);
            }
            return this.LogBooks[logDate];
        } catch (error) {
            BL.homey.error(error);
        }
    }
    submitLogBookForDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) logBook.submitForDiagnostic();
    }

    retrieveLogBookDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) return logBook.retrieveForDiagnostic();
    }
}



class LogBook {

    constructor({ id, file, date }) {
        this.id = id;
        this.date = date;
        this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        this.file = file;
        this.path = substring(this.file, 0, this.file.lastIndexOf('/'));
        this.filesCreated = false;
    }

    async destroy() {
        if (this.fdRead && Number.isInteger(this.fdRead)) try {
            closeSync(this.fdRead);
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        } else if (this.fdRead) try {
            this.fdRead.close();
            this.fdRead = null;
        } catch (error) { }

        if (this.logStream) try {
            this.logStream.destroy();
            this.logStream = null;
        } catch (error) { }

        if (this.indexStream) try {
            this.indexStream.destroy();
            this.indexStream = null;
        } catch (error) { }
        this.filesCreated = false;
    }

    createFile() {
        let path = this.path;

        if (!(existsSync(path))) mkdirSync(path, { recursive: true });

        this.logStream = createWriteStream(this.file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
        this.indexStream = createWriteStream(this.file + '.index', { flags: 'a', autoClose: true });
        this.filesCreated = true;
    }

    writeLine({ message, severity = '', facility = '', timestamp, app = '', hostname = '' } = {}) {
        if (!this.filesCreated) this.createFile();
        if (!this.logStream) return;
        let defer = new Defer();

        let timeNr = (timestamp.getTime() - this.datestarttime);

        //let msg = timeNr + ';' + severity + ';' + facility + ';' + app + ';' + message;//compress(message);
        //let msg = facility + ';' + app + ';' + JSON.stringify(message);//compress(message);
        //let msg = (app ? JSON.stringify(app) : '') + ',' + JSON.stringify(message);//compress(message);

        let msg = JSON.stringify(message);
        let bytes = msg + '\n';

        this.logStream.write(bytes, (error) => {
            if (error) defer.reject(new Error(error));
            defer.resolve();
        });
        //let index = [bytes.length,timeNr,severity,facility];
        this.indexStream.write(`${bytes.length};${timeNr};${severity};${facility};${app};${hostname}\n`);
        // if(this.index.length) index.unshift(this.index[this.index.length-1][0]+this.index[this.index.length-1][1]);
        // else index.unshift(0);
        // this.index.push(index);

        return defer.promise;
    }

    read(start, length) {
        //BL.homey.log('LogBook.read');
        let defer = new Defer();
        if (!this.fdRead) this.fdRead = openSync(this.file + '.log', 'r');
        //if (!this.fdRead) this.fdRead = await fs.open(this.file + '.log', 'r');

        let buffer = Buffer.alloc(length);
        //await readAsync(this.fdRead, buffer, 0, length, start);        
        readSync(this.fdRead, buffer, 0, length, start);
        //await this.fdRead.read(buffer, 0, length, start);
        return buffer.toString('utf8');
    }


    getLogFile() {
        // BL.homey.log('LogBook.getLogFile');
        // try {
        //     //if (!this._logFile) this._logFile = (await fs.readFile(this.file + '.log')).toString('utf8');
        //     if (!this._logFile) this._logFile = readFileSync(this.file + '.log', {encoding:'utf8'});
        // } catch (error) {
        // }
        // return this._logFile;
        try {
            //if (!this._logFile) this._logFile = (await fs.readFile(this.file + '.log')).toString('utf8');
            return readFileSync(this.file + '.log', { encoding: 'utf8' });
        } catch (error) {
        }
    }

    async getLogs({ severity, facility, hostnames, apps, message, take, skip } = {}) {
        if (this.logs && this.logs.length) return this.logs;
        let logs = [];
        //let ind = readFileSync(this.file + '.index', { encoding: 'utf8' });
        //this.getLogFile();
        //return logs;
        try {
            //return logs;
            //let index = (await fs.readFile(this.file + '.index'));
            let index = readFileSync(this.file + '.index', { encoding: 'utf8' });
            //return [];
            //BL.homey.log('readFileSync index');
            //return logs;
            //this._index = index; // saves it for debugging?
            if (index) {
                //index = index;//.toString('utf8');
                let indexes = index.split('\n');

                let position = 0;
                for (let i = 0; i < indexes.length - 1; i++) {
                    let fixFile = false;
                    if (!Number.isInteger(Number.parseInt(indexes[i][0]))) {
                        for (let j = 0; j < indexes[i].length; j++) {
                            if (Number.isInteger(Number.parseInt(indexes[i][j]))) {
                                indexes[i] = indexes[i].substring(j);
                                fixFile = true;

                                this.indexStream.close();
                                unlinkSync(this.file + '.index');
                                this.indexStream = createWriteStream(this.file + '.index', { flags: 'a', autoClose: true, encoding: "utf8" });
                                let defer = new Defer();
                                this.indexStream.write(indexes.join('\n'), (error) => {
                                    defer.resolve();
                                });
                                await defer.promise;
                                break;
                            }
                        }

                    }
                    const _index = indexes[i].split(';');
                    //continue;
                    let length = Number.parseInt(_index[0]);
                    let oldPos = position;
                    position += length;
                    if (fixFile) {
                        let logFile = this.getLogFile();
                        for (let j = oldPos; j < logFile.length; j++) {
                            if (logFile[j] == "\"") {
                                logFile = logFile.substring(0, oldPos) + logFile.substring(j);

                                this.logStream.close();
                                unlinkSync(this.file + '.log');
                                this.logStream = createWriteStream(this.file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
                                let defer = new Defer();
                                this.logStream.write(logFile, (error) => {
                                    defer.resolve();
                                });
                                await defer.promise;
                                break;
                            }
                        }
                    }
                    let _severity = Number.parseInt(_index[2]);
                    if (severity !== undefined && _severity !== severity) continue;
                    let _facility = Number.parseInt(_index[3]);
                    if (facility !== undefined && _facility !== facility) continue;
                    let _app = Number.parseInt(_index[4]);
                    if (apps !== undefined && apps.indexOf(_app) === -1)
                        continue;

                    let _hostname = _index.length > 5 ? Number.parseInt(_index[5]) : undefined;
                    if (_index.length === '0') {
                        let a = 0;
                    }
                    if (hostnames !== undefined && hostnames.indexOf(_hostname) === -1)
                        continue;
                    let log = {
                        id: this.id + '$' + i,
                        timestamp: new Date(Number.parseInt(_index[1]) + this.datestarttime),
                        length,
                        position: oldPos
                    };
                    if (!Number.isNaN(_severity)) log.severity = _severity;
                    if (!Number.isNaN(_facility)) log.facility = _facility;

                    if (!Number.isNaN(_app) && _app !== undefined && _app !== null) log.app = BL.homey.app.Log.LogApps[_app];
                    if (!Number.isNaN(_hostname) && _hostname !== undefined && _hostname !== null) log.hostname = BL.homey.app.Log.LogHostnames[_hostname];

                    // log.length = length;
                    // log.position = oldPos;
                    //log = BL._.clone(log);
                    logs.push(log);

                    //if (logs.length >= take && !skip) break;
                }
            }
        } catch (error) {
            BL.homey.error(error);
        }
        //return logs;

        //let a = await this.getLogFile();
        //let logFile = logs.length >= 10 ? await this.getLogFile() : null; // Or greater than x %?
        let logFile = this.getLogFile(); // Get Full files
        //let logFile = null; // Read parts of  files
        //let errorOccured = false;

        if (true) for (let i = 0; i < logs.length; i++) {
            const log = logs[i];

            try {
                let logString = logFile ? substring(logFile, log.position, log.position + log.length) : this.read(log.position, log.length);
                // let logStrings = JSON.parse(`[${logString.startsWith(',') ? '""' : ''}${logString}]`);
                // log.app = BL.homey.app.Log.LogApps[logStrings[0]];
                // log.message = logStrings[1];

                log.message = JSON.parse(logString);
            } catch (error) {
                try {
                    BL.homey.error('logString', substring(logFile, log.position, log.position + log.length), '\nLogIndex:', log, '\n', error);
                    //errorOccured = true;
                } catch (error) {

                }
            }
            delete log.length;
            delete log.position;
        }

        // if (errorOccured) {
        //     BL.homey.error('logFile\n', logFile.substring(0, 200));
        // }
        if (message) logs = BL._.filter(logs, x => x.message && x.message.toLowerCase().indexOf(message.toLowerCase()) > -1);

        logFile = null;
        delete this._logFile; // for debugging disable this line.
        if (this.fdRead && Number.isInteger(this.fdRead)) try {
            closeSync(this.fdRead);
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        } else if (this.fdRead) try {
            this.fdRead.close();
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        }
        //this.logs = logs; // for debugging, enable this line.
        return logs;
    }

    retrieveForDiagnostic() {
        return `'logbook: ' ${this.id}\nIndex:\n${readFileSync(this.file + '.index', { encoding: 'utf8' })}\nlogFile:\n${this.getLogFile()}`;
    }
    submitForDiagnostic() {
        BL.homey.log('logbook:', this.id, '\nIndex:\n', readFileSync(this.file + '.index', { encoding: 'utf8' }), '\nlogFile:\n', this.getLogFile())
    }
}

module.exports = { Log, SEVERITIES, FACILITIES };