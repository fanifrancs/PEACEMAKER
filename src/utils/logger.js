import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.PEACEMAKER_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => {
        return new Date().toLocaleString('en-GB', {
          timeZone: 'Africa/Lagos',
          hour12: false,
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).replace(',', '');
      }
    }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level}]: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'peacemaker.log' }),
  ],
});

export default logger;

// Made with Bob
