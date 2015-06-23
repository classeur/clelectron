var gulp = require('gulp');
var electron = require('gulp-atom-electron');
var extend = require('util')._extend;

var electronOptions = {
	version: '0.28.2',
	winIcon: 'classeur.ico',
	darwinIcon: 'classeur.icns',
};

gulp.task('default', function() {
	return gulp.src(['main.js', 'package.json', 'preload.js'])
		.pipe(electron(extend({
			platform: 'darwin',
		}, electronOptions)))
		.pipe(electron.zfsdest('classeur-darwin.zip'));
});
