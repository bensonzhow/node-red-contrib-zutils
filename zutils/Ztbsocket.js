module.exports = function (RED) {
    "use strict";
    let chalk = require("chalk");
    const WebSocket = require('ws');
    function Ztbsocket(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        let node = this;
        let zclient = null;
        let zcfg = {
            closeAfterSent: true, // close after sent
            sendAfterConnect: true, // send after connect
            sendMsg: null,
            zurl: null
        };
        let cmdId = 0;
        let isAuth = false;
        let isAuthing = false;

        let zlog = {
            warn: function (msg) {
                console.log("zlog:", msg);
                node.warn(chalk.yellow(msg));
            },
            log: function (msg) {
                console.log("zlog:", msg);
                node.log(chalk.blue(msg));
            },
            info: function (msg) {
                console.log("zlog:", msg);
                node.log(chalk.green(msg));
            },
            error: function (msg) {
                console.log("zlog:", msg);
                node.error(chalk.red(msg));
            }
        };
        function init(msg) {
            zcfg = Object.assign(zcfg, msg.zcfg || {});
            zlog.info("Ztbsocket init" + JSON.stringify(zcfg));
            if (!zcfg.zurl) {
                zlog.error("No URL provided,set msg.zcfg.zurl");
                return;
            }
            if (zclient) {
                closeZclient();
            }
            zclient = new WebSocket(zcfg.zurl);
            initEvents(msg);
        }
        function output(merr = null, listenerSmg = null, msg) {
            node.send([merr, listenerSmg, msg]);
        }
        function getCmdId() {
            cmdId++;
            if (cmdId > 5000) {
                cmdId = 0;
            }
            return cmdId;
        }
        function autoAouth(msg) {
            if (zcfg.token) {
                let cmdId = getCmdId();
                let aouth = { "cmds": [{ "type": "NOTIFICATIONS_COUNT", "cmdId": 1 }], "authCmd": { "cmdId": 0, "token": zcfg.token } };
                setTimeout(function () {
                    sendData(aouth, msg);
                }, 1000);
            } else {
                zlog.error("No token provided,set msg.zcfg.token");
            }
        }

        function initEvents(msg) {

            zclient.on('open', function (event) {
                zlog.info("WebSocket is open now.");
                publishWhenAuth(msg);
            });
            zclient.on('close', function (event) {
                zlog.info("WebSocket is closed now.");
                closeZclient();
            });
            zclient.on('message', function (event) {
                onData(JSON.parse(event), msg);
            });
            zclient.on('error', function (error) {
                zlog.error("WebSocket error: " + error);
                output(error, null, null);
            });
        }

        let _timerpp = null;
        function publishWhenAuth(msg) {
            _timerpp = setInterval(function () {
                if (isAuth) {
                    zlog.info("Publish when auth");
                    clearInterval(_timerpp);
                    autoSendData(msg);
                } else {
                    if (zclient && zclient.readyState === WebSocket.OPEN && !isAuthing) {
                        autoAouth(msg)
                        isAuthing = true;
                    }
                }
            }, 500);
        }

        function onData(data, msg) {

            if (data && data.errorCode == 0) {
                if (isAuth) {
                    output(null, null, Object.assign(msg, { payload: data }));
                    sendToClose(msg);
                }
                isAuth = true;
            } else {
                isAuth = false;
                zlog.error(`Error: ${JSON.stringify(data)}`);
                output(data, null, null);
            }

        }
        function autoSendData(msg) {
            zlog.info("Auto send data");
            if (zcfg.sendAfterConnect && zcfg.sendMsg) {
                setTimeout(function () {
                    sendData(zcfg.sendMsg, msg);
                }, 1000);

            }
        }
        function sendToClose(msg) {
            if (zcfg.closeAfterSent && zclient) {
                zlog.info("WebSocket closed after sent");
                setTimeout(function () {
                    closeZclient();
                }, 500);
            }
        }
        function sendData(data, msg) {
            let newData = "";
            if (!zclient || zclient.readyState !== WebSocket.OPEN) {
                node.init(msg);
            }
            if (zclient && zclient.readyState === WebSocket.OPEN) {
                try {
                    if (data instanceof Object) {
                        newData = JSON.stringify(data);
                    } else {
                        newData = data;
                    }
                    zclient.send(newData, (err) => {
                        if (err) {
                            zlog.error("Send error: " + err);
                            output(err, null, null);
                        }
                    });
                } catch (e) {
                    output(e, null, null);
                }

            }

        }

        function onInput(msg) {
            zlog.info("Input: " + msg.payload);
            if (!zclient) {
                init(msg);
            } else {
                if (!isAuth) {
                    autoAouth(msg);
                } else {
                    autoSendData(msg);
                }

            }

        }
        function closeZclient() {
            cmdId = 0;
            isAuth = false;
            isAuthing = false;

            if (zclient) {
                zclient.close();
            }
            zlog.info("WebSocket closed");
            zclient = null;
        }
        function onClose(done) {
            closeZclient();
            done();
        }
        function onError(msg) {
            zlog.error("Error: " + msg.error);
        }

        node.on("input", onInput);
        node.on("close", onClose);
        node.on("error", onError);
    }
    RED.nodes.registerType("Ztbsocket", Ztbsocket);
}