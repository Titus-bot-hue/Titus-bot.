module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json')
  });

  // ✅ Define a default task that just logs success
  grunt.registerTask('default', function() {
    grunt.log.writeln('✅ Grunt default task ran successfully.');
  });
};
