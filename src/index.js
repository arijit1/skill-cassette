module.exports = {
  ...require('./config'),
  ...require('./git'),
  ...require('./glob'),
  ...require('./backends'),
  ...require('./registry'),
  ...require('./router'),
  ...require('./composer'),
  ...require('./scaffold'),
  ...require('./cli')
};
