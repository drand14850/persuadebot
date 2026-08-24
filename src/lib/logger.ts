//About Pino: https://getpino.io/#/
import pino from 'pino';
import pretty from 'pino-pretty';

// Conditionally import pino-pretty and create a stream only if in development
let prettyStream;
//console.log("NODE_ENV: ", process.env.NODE_ENV);

if (process.env.NODE_ENV === 'development') {
    //Create a stream that uses pino-pretty
    prettyStream = pretty({
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
        levelFirst: false
    });
}



// Production defaults to 'warn' so the Vercel log shows only things that need attention.
// info/debug calls then cost nothing — pino drops them before serializing.
// Set LOG_LEVEL=info in the Vercel environment to turn the detail back on while debugging.
export const logger = pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'warn'),
    base: process.env.NODE_ENV === 'development' ? null : {}, 
}, prettyStream);