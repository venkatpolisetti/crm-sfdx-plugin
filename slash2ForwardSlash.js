var replace = require("replace-x");
 
replace({
  regex: "\\\\",
  replacement: "/",
  paths: [process.argv[2]],
  silent: true,
});
