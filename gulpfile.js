var rimraf = require('rimraf');
var clgulp = require('clgulp');
var gulp = clgulp(require('gulp'));
var util = clgulp.util;
var exec = clgulp.exec;
var electron = require('gulp-atom-electron');
var symdest = require('gulp-symdest');
var extend = require('util')._extend;
var appdmg = require('appdmg');
var release = require('gulp-github-release');

var electronOptions = {
	version: '0.34.2',
	winIcon: 'assets/images/icon.ico',
	darwinIcon: 'assets/images/icon.icns',
};

var src = [
	'package.json',
	'src/*',
	'node_modules/spellchecker/**/*',
];

gulp.task('clean', function(cb) {
	rimraf('./dist', cb);
});

gulp.task('clean:osx', function(cb) {
	rimraf('./dist/osx', cb);
});

gulp.task('build:osx', ['clean:osx'], function() {
	return gulp.src(src, {
			base: '.'
		})
		.pipe(electron(extend({
			platform: 'darwin',
		}, electronOptions)))
		.pipe(symdest('dist/osx'));
});

gulp.task('sign:osx', ['build:osx'], function(cb) {
	exec('codesign -f -v --deep -s "Developer ID Application: Benoit Schweblin (NX787V9962)" dist/osx/Classeur.app', cb);
});

gulp.task('zip:osx', ['sign:osx'], function(cb) {
	exec('zip --symlinks -r classeur-osx.zip Classeur.app', {
		cwd: 'dist/osx'
	}, cb);
});

gulp.task('pack:osx', ['sign:osx'], function(cb) {
	exec('umount /Volumes/Classeur', function() {
		var ee = appdmg({
			target: 'dist/osx/classeur-osx.dmg',
			basepath: __dirname,
			specification: {
				title: 'Classeur',
				background: 'assets/images/landing-bg.jpg',
				icon: 'assets/images/icon.icns',
				'icon-size': 80,
				contents: [{
					x: 450,
					y: 242,
					type: 'link',
					path: '/Applications'
				}, {
					x: 190,
					y: 242,
					type: 'file',
					path: 'dist/osx/Classeur.app'
				}]
			}
		});
		ee.on('progress', function(info) {
			info.title && util.log(info.title);
		});
		ee.on('finish', cb);
		ee.on('error', cb);
	});
});

gulp.task('publish:osx', ['zip:osx', 'pack:osx'], function() {
	gulp.src([
			'dist/osx/classeur-osx.zip',
			'dist/osx/classeur-osx.dmg'
		])
		.pipe(release({
			owner: 'classeur',
			repo: 'clelectron',
			manifest: require('./package.json')
		}));
});
