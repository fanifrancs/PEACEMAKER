const winston = require('winston');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

// Create logger instance
const logger = winston.createLogger({
  level: process.env.PEACEMAKER_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: () => new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false }).replace(',', '') }),
    winston.format.printf(({ level, message, timestamp }) => {
      let levelColor;
      switch (level) {
        case 'error': levelColor = colors.red; break;
        case 'warn': levelColor = colors.yellow; break;
        case 'info': levelColor = colors.blue; break;
        case 'debug': levelColor = colors.magenta; break;
        default: levelColor = colors.white;
      }
      return `${colors.gray}${timestamp}${colors.reset} [${levelColor}${level}${colors.reset}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'peacemaker.log' })
  ]
});

// Add setLevel method for dynamic level changes
logger.setLevel = (level) => {
  logger.level = level;
};

// Custom log levels
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;

// Made with Bob
