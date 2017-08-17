var webpack = require("webpack");

module.exports = {
  entry: './app.js',
  output: {
    path: __dirname + '/app/',
    filename: 'bundle.js',
		publicPath: '/app/'
  }
}
