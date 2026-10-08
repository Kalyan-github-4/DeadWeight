"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list2, loose) => list2.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list2, loose) => list2.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "node_modules/semver/functions/truncate.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module2.exports = truncate;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module2.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module2.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/ignore/index.js
var require_ignore = __commonJS({
  "node_modules/ignore/index.js"(exports2, module2) {
    function makeArray(subject) {
      return Array.isArray(subject) ? subject : [subject];
    }
    var UNDEFINED = void 0;
    var EMPTY2 = "";
    var SPACE = " ";
    var ESCAPE = "\\";
    var REGEX_LITERAL_SPECIAL = /[.*+?()[\]{}^$|\\/]/;
    var REGEX_TEST_BLANK_LINE = /^\uFEFF? *$/;
    var REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
    var REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
    var REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
    var REGEX_SPLITALL_CRLF = /\r?\n/g;
    var DOUBLE_SLASH = "//";
    var SLASH_CODE = 47;
    var DOT_CODE = 46;
    var SLASH = "/";
    var TMP_KEY_IGNORE = "node-ignore";
    if (typeof Symbol !== "undefined") {
      TMP_KEY_IGNORE = /* @__PURE__ */ Symbol.for("node-ignore");
    }
    var KEY_IGNORE = TMP_KEY_IGNORE;
    var define = (object, key, value) => {
      Object.defineProperty(object, key, { value });
      return value;
    };
    var RETURN_FALSE = () => false;
    var cleanRangeBackSlash = (slashes) => {
      const { length } = slashes;
      return slashes.slice(0, length - length % 2);
    };
    var POSIX_CLASSES = {
      alnum: "0-9A-Za-z",
      alpha: "A-Za-z",
      blank: " \\t",
      cntrl: "\\x00-\\x1f\\x7f",
      digit: "0-9",
      graph: "!-.0-~",
      lower: "a-z",
      print: " -.0-~",
      punct: "!-.:-@\\[-`{-~",
      // git's `sane-ctype.h` classifies \v and \f as control, not space,
      //   unlike C's `isspace`
      space: " \\t\\n\\r",
      upper: "A-Z",
      xdigit: "0-9A-Fa-f"
    };
    var CLASS_MEMBERS_TO_ESCAPE = "\\]^-[";
    var escapeMember = (char) => CLASS_MEMBERS_TO_ESCAPE.indexOf(char) < 0 ? char : ESCAPE + char;
    var NON_SLASH = "(?!\\/)";
    var classSource = (negated, body) => {
      if (negated) {
        return `[^\\/${body}]`;
      }
      const source = `[${body}]`;
      return new RegExp(source).test("/") ? NON_SLASH + source : source;
    };
    var scanBracket = (pattern, start) => {
      const { length } = pattern;
      let index = start + 1;
      let negated = EMPTY2;
      const lead = pattern[index];
      if (lead === "!" || lead === "^") {
        negated = "^";
        index++;
      }
      let body = EMPTY2;
      let prev = EMPTY2;
      for (; ; ) {
        const char = pattern[index];
        if (char === UNDEFINED) {
          return null;
        }
        if (char === ESCAPE) {
          const escaped = pattern[index + 1];
          if (escaped === UNDEFINED) {
            return null;
          }
          body += escapeMember(escaped);
          prev = escaped;
          index++;
        } else if (char === "-" && prev && index + 1 < length && pattern[index + 1] !== "]") {
          index++;
          let to = pattern[index];
          if (to === ESCAPE) {
            to = pattern[index += 1];
          }
          if (prev <= to) {
            body += `-${escapeMember(to)}`;
          }
          prev = EMPTY2;
        } else if (char === "[" && pattern[index + 1] === ":") {
          const nameStart = index + 2;
          let end = nameStart;
          while (end < length && pattern[end] !== "]") {
            end++;
          }
          if (end === length) {
            return null;
          }
          if (end > nameStart && pattern[end - 1] === ":") {
            const expanded = POSIX_CLASSES[pattern.slice(nameStart, end - 1)];
            if (expanded === UNDEFINED) {
              return null;
            }
            body += expanded;
            prev = EMPTY2;
            index = end;
          } else {
            body += escapeMember("[");
            prev = "[";
            index = nameStart - 2;
          }
        } else {
          body += escapeMember(char);
          prev = char;
        }
        index++;
        if (pattern[index] === "]") {
          return {
            end: index,
            source: classSource(negated, body)
          };
        }
      }
    };
    var NEVER_MATCH = "[]";
    var PLACEHOLDER = "\0";
    var REGEX_RESTORE_PLACEHOLDER = new RegExp(
      `${PLACEHOLDER}(\\d+)${PLACEHOLDER}`,
      "g"
    );
    var TRAILING_WILDCARD = "\uE000";
    var extractBrackets = (pattern) => {
      const sources = [];
      const hold = (source) => `${PLACEHOLDER}${sources.push(source) - 1}${PLACEHOLDER}`;
      const { length } = pattern;
      let out = EMPTY2;
      let index = 0;
      while (index < length) {
        const char = pattern[index];
        if (char === ESCAPE) {
          const escaped = pattern[index + 1];
          if (escaped === "*" || escaped === "[" || escaped === SPACE || escaped === ESCAPE) {
            out += pattern.slice(index, index + 2);
          } else {
            out += hold(
              REGEX_LITERAL_SPECIAL.test(escaped) ? ESCAPE + escaped : escaped
            );
          }
          index += 2;
        } else if (char === PLACEHOLDER) {
          out += hold(`[${PLACEHOLDER}]`);
          index++;
        } else if (char === "[") {
          const scanned = scanBracket(pattern, index);
          if (scanned === null) {
            out += hold(NEVER_MATCH);
            index = length;
          } else {
            out += hold(scanned.source);
            index = scanned.end + 1;
          }
        } else {
          out += char;
          index++;
        }
      }
      return {
        source: out,
        sources
      };
    };
    var DIRECT = null;
    var REGEX_INNER_SLASH = /\/(?!$)/;
    var REPLACERS = [
      [
        // Remove BOM
        // TODO:
        // Other similar zero-width characters?
        /^\uFEFF/,
        () => EMPTY2,
        "\uFEFF"
      ],
      [
        // A trailing line terminator, left on when a whole file's contents are
        //   added as one pattern rather than split into lines. git never sees one
        //   -- it reads a `.gitignore` line by line -- so it is not part of the
        //   pattern and is dropped here, apart from the trailing-space trimming,
        //   which follows git in touching spaces and nothing else.
        /[\r\n]+$/,
        () => EMPTY2
      ],
      // > Trailing spaces are ignored unless they are quoted with backslash ("\")
      [
        // Only spaces, never tabs or other whitespace: git trims a trailing run
        //   of `' '` and nothing else (dir.c, `trim_trailing_spaces`, a single
        //   `case ' '`), so a pattern ending in a tab keeps it as a literal.
        // (a\ ) -> (a )
        // (a  ) -> (a)
        // (a ) -> (a)
        // (a \ ) -> (a  )
        /((?:\\\\)*?)(\\? +)$/,
        (_, m1, m2) => m1 + (m2.indexOf("\\") === 0 ? SPACE : EMPTY2)
      ],
      // Replace (\ ) with ' '
      // Only a space: an escaped tab or other whitespace is already a literal by
      //   the time it reaches here, and a bare tab must be left as one, not turned
      //   into a space.
      // (\ ) -> ' '
      // (\\ ) -> '\\ '
      // (\\\ ) -> '\\ '
      [
        /(\\+?) /g,
        (_, m1) => {
          const { length } = m1;
          return m1.slice(0, length - length % 2) + SPACE;
        }
      ],
      // Escape metacharacters
      // which is written down by users but means special for regular expressions.
      // > There are 12 characters with special meanings:
      // > - the backslash \,
      // > - the caret ^,
      // > - the dollar sign $,
      // > - the period or dot .,
      // > - the vertical bar or pipe symbol |,
      // > - the question mark ?,
      // > - the asterisk or star *,
      // > - the plus sign +,
      // > - the opening parenthesis (,
      // > - the closing parenthesis ),
      // > - and the opening square bracket [,
      // > - the opening curly brace {,
      // > These special characters are often called "metacharacters".
      [
        /[\\$.|*+(){^]/g,
        (match) => `\\${match}`
      ],
      [
        // > a question mark (?) matches a single character
        /(?!\\)\?/g,
        () => "[^/]",
        "?"
      ],
      // leading slash
      [
        // > A leading slash matches the beginning of the pathname.
        // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
        // A leading slash matches the beginning of the pathname
        /^\//,
        () => "^",
        SLASH
      ],
      // replace special metacharacter slash after the leading slash
      [
        /\//g,
        () => "\\/",
        SLASH
      ],
      [
        // > A leading "**" followed by a slash means match in all directories.
        // > For example, "**/foo" matches file or directory "foo" anywhere,
        // > the same as pattern "foo".
        // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
        // >   under directory "foo".
        // Notice that the '*'s have been replaced as '\\*'
        /^\^*(?:\\\*\\\*\\\/)+/,
        // '**/foo' <-> 'foo'
        () => "^(?:.*\\/)?",
        "*"
      ],
      // starting
      [
        // there will be no leading '/'
        //   (which has been replaced by section "leading slash")
        // If starts with '**', adding a '^' to the regular expression also works
        DIRECT,
        (source, pattern) => {
          if (!source || source[0] === "^") {
            return source;
          }
          const anchor = !REGEX_INNER_SLASH.test(pattern) ? "(?:^|\\/)" : "^";
          return anchor + source;
        }
      ],
      // two globstars
      [
        // Use lookahead assertions so that we could match more than one `'/**'`
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        // Zero, one or several directories
        // should not use '*', or it will be replaced by the next replacer
        // Check if it is not the last `'/**'`
        (_, index, str) => index + 6 < str.length ? str.slice(index + 6) === "\\/" ? "(?:\\/[^\\/]+)+" : "(?:\\/[^\\/]+)*" : "\\/.+",
        "*"
      ],
      // normal intermediate wildcards
      [
        // Never replace escaped '*'
        // ignore rule '\*' will match the path '*'
        // 'abc.*/' -> go
        // 'abc.*'  -> skip this rule,
        //    coz trailing single wildcard will be handed by [trailing wildcard]
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        // '*.js' matches '.js'
        // '*.js' doesn't match 'abc'
        (_, p1, p2) => {
          const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
          return p1 + unescaped;
        },
        "*"
      ],
      // trailing wildcard, held apart from a literal star
      [
        // The step above leaves a trailing `*` alone, so a single `\*` is all that
        //   can be left at the end here. Whether it is a wildcard or a literal
        //   turns on the backslashes the user put in front of it: the escaper has
        //   since doubled every one, so what stands here is those `2N` doubled
        //   backslashes and then the star's own escape. An even number of the
        //   original `N` leaves the star unescaped -- a wildcard -- and an odd
        //   number escapes it -- a literal. This runs while the two are still
        //   distinct, before the unescape steps below collapse the literal onto
        //   the very `\*` a wildcard leaves behind.
        /(^|[^\\])((?:\\\\)*)\\\*$/,
        (match, p1, p2) => (
          // `p2` holds the doubled user backslashes; half of them is `N`.
          p2.length / 2 % 2 === 0 ? p1 + p2 + TRAILING_WILDCARD : match
        ),
        "*"
      ],
      [
        // unescape, revert step 3 except for back slash
        // For example, if a user escape a '\\*',
        // after step 3, the result will be '\\\\\\*'
        /\\\\\\(?=[$.|*+(){^])/g,
        () => ESCAPE,
        ESCAPE + ESCAPE
      ],
      [
        // '\\\\' -> '\\'
        /\\\\/g,
        () => ESCAPE,
        ESCAPE + ESCAPE
      ],
      [
        // Every real bracket expression -- POSIX classes included -- has already
        //   been held aside by `extractBrackets`, so the only `[` left in the
        //   pattern is an escaped, literal one.
        // `\` is escaped by step 3
        /\\\[([^\]/]*?)(\\*)($|\])/g,
        // '\\[bar]' -> '\\\\[bar\\]'
        (match, range, endEscape, close) => `\\[${range}${cleanRangeBackSlash(endEscape)}${close}`,
        "["
      ],
      // ending
      [
        // 'js' will not match 'js.'
        // 'ab' will not match 'abc'
        DIRECT,
        // WTF!
        // https://git-scm.com/docs/gitignore
        // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
        // which re-fixes #24, #38
        // > If there is a separator at the end of the pattern then the pattern
        // > will only match directories, otherwise the pattern can match both
        // > files and directories.
        // 'js*' will not match 'a.js'
        // 'js/' will not match 'a.js'
        // 'js' will match 'a.js' and 'a.js/'
        (source) => {
          const last = source[source.length - 1];
          if (!last || last === TRAILING_WILDCARD) {
            return source;
          }
          return last === SLASH ? `${source}$` : `${source}(?=$|\\/$)`;
        }
      ]
    ];
    var REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\uE000$/;
    var MODE_IGNORE = "regex";
    var MODE_CHECK_IGNORE = "checkRegex";
    var UNDERSCORE = "_";
    var TRAILING_WILD_CARD_REPLACERS = {
      [MODE_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]+` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      },
      [MODE_CHECK_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]*` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      }
    };
    var WILDCARD = "[^\\/]*";
    var pinWildcards = (source) => {
      if (source.indexOf(WILDCARD) < 0) {
        return source;
      }
      const tokens = [];
      const { length } = source;
      let index = 0;
      while (index < length) {
        const char = source[index];
        if (source.startsWith(WILDCARD, index)) {
          tokens.push({ wildcard: true });
          index += WILDCARD.length;
        } else if (char === "[") {
          let end = index + 1;
          if (source[end] === "^") {
            end++;
          }
          if (source[end] === "]") {
            end++;
          }
          while (end < length && source[end] !== "]") {
            end += source[end] === ESCAPE ? 2 : 1;
          }
          end++;
          tokens.push({ single: source.slice(index, end) });
          index = end;
        } else if (char === ESCAPE) {
          tokens.push({ single: source.slice(index, index + 2) });
          index += 2;
        } else if (char === "(") {
          let depth = 0;
          let end = index;
          do {
            if (source[end] === ESCAPE) {
              end++;
            } else if (source[end] === "(") {
              depth++;
            } else if (source[end] === ")") {
              depth--;
            }
            end++;
          } while (end < length && depth > 0);
          if ("*+?".indexOf(source[end]) >= 0) {
            end++;
          }
          tokens.push({ boundary: source.slice(index, end) });
          index = end;
        } else if (char === "^" || char === "$") {
          tokens.push({ boundary: char });
          index++;
        } else {
          tokens.push({ single: char });
          index++;
        }
      }
      let out = EMPTY2;
      let run2 = [];
      const flush = () => {
        let lastWildcard;
        run2.forEach((token, at) => {
          if (token.wildcard) {
            lastWildcard = at;
          }
        });
        run2.forEach((token, at) => {
          if (!token.wildcard) {
            out += token.single;
            return;
          }
          out += at === lastWildcard ? WILDCARD : `(?:(?!${run2[at + 1].single})[^\\/])*`;
        });
        run2 = [];
      };
      tokens.forEach((token) => {
        if (token.boundary === void 0) {
          run2.push(token);
          return;
        }
        flush();
        out += token.boundary;
      });
      flush();
      return out;
    };
    var makeRegexPrefix = (pattern) => {
      const { source, sources } = extractBrackets(pattern);
      const replaced = REPLACERS.reduce(
        // A pass whose matcher finds nothing hands back the very string it was
        //   given, so asking first costs a search and saves a rewrite. Ten of the
        //   fifteen passes never fire for a typical .gitignore line, and between
        //   them they were 45% of this chain.
        (prev, [matcher, replacer, required]) => {
          if (matcher === DIRECT) {
            return replacer(prev, pattern);
          }
          if (required !== UNDEFINED && prev.indexOf(required) < 0) {
            return prev;
          }
          return matcher.test(prev) ? prev.replace(matcher, replacer.bind(pattern)) : prev;
        },
        source
      );
      return sources.length ? replaced.replace(
        REGEX_RESTORE_PLACEHOLDER,
        (match, index) => sources[index]
      ) : replaced;
    };
    var matchesBasename = (body) => {
      const index = body.indexOf(SLASH);
      return index < 0 || index === body.length - 1;
    };
    var basenameOf = (path) => {
      const end = path.length - 1;
      const index = path.lastIndexOf(
        SLASH,
        path[end] === SLASH ? end - 1 : end
      );
      return index < 0 ? path : path.slice(index + 1);
    };
    var parentOf = (path) => {
      if (path.charCodeAt(0) === SLASH_CODE || path.indexOf(DOUBLE_SLASH) >= 0) {
        const slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        return slices.length ? slices.join(SLASH) + SLASH : EMPTY2;
      }
      const end = path.length - 1;
      const cut = path.lastIndexOf(
        SLASH,
        path.charCodeAt(end) === SLASH_CODE ? end - 1 : end
      );
      return cut < 0 ? EMPTY2 : path.slice(0, cut + 1);
    };
    var isString = (subject) => typeof subject === "string";
    var checkPattern = (pattern) => pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && pattern.indexOf("#") !== 0;
    var splitPattern = (pattern) => pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);
    var IgnoreRule = class {
      constructor(pattern, mark, body, ignoreCase, negative, prefix) {
        this.pattern = pattern;
        this.mark = mark;
        this.negative = negative;
        define(this, "body", body);
        define(this, "ignoreCase", ignoreCase);
        define(this, "regexPrefix", prefix);
      }
      // Worked out on first use and kept behind an own property, the way `regex`
      //   caches itself in `_regex`. Deciding it in the constructor instead would
      //   add a fourth `defineProperty` to every rule ever built, which cost 4% of
      //   every compile -- including the compiles of rules that are never matched
      //   against anything.
      get _basenameOnly() {
        return define(this, "_basenameOnly", matchesBasename(this.body));
      }
      get regex() {
        const key = UNDERSCORE + MODE_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_IGNORE, key);
      }
      get checkRegex() {
        const key = UNDERSCORE + MODE_CHECK_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_CHECK_IGNORE, key);
      }
      _make(mode, key) {
        const str = pinWildcards(this.regexPrefix.replace(
          REGEX_REPLACE_TRAILING_WILDCARD,
          // It does not need to bind pattern
          TRAILING_WILD_CARD_REPLACERS[mode]
        ));
        const regex = this.ignoreCase ? new RegExp(str, "i") : new RegExp(str);
        return define(this, key, regex);
      }
    };
    var createRule = ({
      pattern,
      mark
    }, ignoreCase) => {
      let negative = false;
      let body = pattern;
      if (body.indexOf("!") === 0) {
        negative = true;
        body = body.substr(1);
      }
      body = body.replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!").replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
      const regexPrefix = makeRegexPrefix(body);
      return new IgnoreRule(
        pattern,
        mark,
        body,
        ignoreCase,
        negative,
        regexPrefix
      );
    };
    var RuleManager = class {
      constructor(ignoreCase) {
        this._ignoreCase = ignoreCase;
        this._rules = [];
        this._basenameCount = 0;
      }
      _add(pattern) {
        if (pattern && pattern[KEY_IGNORE]) {
          this._rules = this._rules.concat(pattern._rules._rules);
          this._basenameCount += pattern._rules._basenameCount;
          this._added = true;
          return;
        }
        if (isString(pattern)) {
          pattern = {
            pattern
          };
        }
        if (checkPattern(pattern.pattern)) {
          const rule = createRule(pattern, this._ignoreCase);
          this._added = true;
          this._rules.push(rule);
          if (matchesBasename(rule.body)) {
            this._basenameCount++;
          }
        }
      }
      // @param {Array<string> | string | Ignore} pattern
      add(pattern) {
        this._added = false;
        makeArray(
          isString(pattern) ? splitPattern(pattern) : pattern
        ).forEach(this._add, this);
        return this._added;
      }
      // Test one single path without recursively checking parent directories
      //
      // - checkUnignored `boolean` whether should check if the path is unignored,
      //   setting `checkUnignored` to `false` could reduce additional
      //   path matching.
      // - check `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`
      // @returns {TestResult} true if a file is ignored
      test(path, checkUnignored, mode) {
        let ignored = false;
        let unignored = false;
        let matchedRule;
        const rules = this._rules;
        const { length } = rules;
        const shortcut = this._basenameCount * 2 >= length;
        const basename2 = shortcut ? basenameOf(path) : path;
        for (let index = 0; index < length; index++) {
          const rule = rules[index];
          const { negative } = rule;
          const skip = unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored;
          if (!skip && rule[mode].test(
            shortcut && rule._basenameOnly ? basename2 : path
          )) {
            ignored = !negative;
            unignored = negative;
            matchedRule = negative ? UNDEFINED : rule;
          }
        }
        const ret = {
          ignored,
          unignored
        };
        if (matchedRule) {
          ret.rule = matchedRule;
        }
        return ret;
      }
    };
    var throwError = (message, Ctor) => {
      throw new Ctor(message);
    };
    var checkPath = (path, originalPath, doThrow) => {
      if (!isString(path)) {
        return doThrow(
          `path must be a string, but got \`${originalPath}\``,
          TypeError
        );
      }
      if (!path) {
        return doThrow(`path must not be empty`, TypeError);
      }
      if (checkPath.isNotRelative(path)) {
        const r = "`path.relative()`d";
        return doThrow(
          `path should be a ${r} string, but got "${originalPath}"`,
          RangeError
        );
      }
      return true;
    };
    var isNotRelative = (path) => {
      const first = path.charCodeAt(0);
      if (first === SLASH_CODE) {
        return true;
      }
      if (first !== DOT_CODE) {
        return false;
      }
      if (path.length === 1) {
        return true;
      }
      const second = path.charCodeAt(1);
      if (second === SLASH_CODE) {
        return true;
      }
      if (second !== DOT_CODE) {
        return false;
      }
      return path.length === 2 || path.charCodeAt(2) === SLASH_CODE;
    };
    checkPath.isNotRelative = isNotRelative;
    checkPath.convert = (p) => p;
    var Ignore = class {
      constructor({
        ignorecase = true,
        ignoreCase = ignorecase,
        allowRelativePaths = false
      } = {}) {
        define(this, KEY_IGNORE, true);
        this._rules = new RuleManager(ignoreCase);
        this._strictPathCheck = !allowRelativePaths;
        this._initCache();
      }
      _initCache() {
        this._ignoreCache = /* @__PURE__ */ Object.create(null);
        this._testCache = /* @__PURE__ */ Object.create(null);
      }
      add(pattern) {
        if (this._rules.add(pattern)) {
          this._initCache();
        }
        return this;
      }
      // legacy
      addPattern(pattern) {
        return this.add(pattern);
      }
      // @returns {TestResult}
      _test(originalPath, cache, checkUnignored) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(
          path,
          originalPath,
          this._strictPathCheck ? throwError : RETURN_FALSE
        );
        return this._t(path, cache, checkUnignored);
      }
      checkIgnore(path) {
        if (path.charCodeAt(path.length - 1) !== SLASH_CODE) {
          return this.test(path);
        }
        const parentPath = parentOf(path);
        if (parentPath) {
          const parent = this._t(parentPath, this._testCache, true);
          if (parent.ignored) {
            return parent;
          }
        }
        return this._rules.test(path, false, MODE_CHECK_IGNORE);
      }
      _t(path, cache, checkUnignored) {
        if (path in cache) {
          return cache[path];
        }
        const parentPath = parentOf(path);
        const parent = parentPath ? this._t(parentPath, cache, checkUnignored) : UNDEFINED;
        return cache[path] = parent && parent.ignored ? parent : this._rules.test(path, checkUnignored, MODE_IGNORE);
      }
      ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
      }
      createFilter() {
        return (path) => !this.ignores(path);
      }
      filter(paths) {
        return makeArray(paths).filter(this.createFilter());
      }
      // @returns {TestResult}
      test(path) {
        return this._test(path, this._testCache, true);
      }
    };
    var factory = (options) => new Ignore(options);
    var isPathValid = (path) => checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
    var setupWindows = () => {
      const makePosix = (str) => /^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str) ? str : str.replace(/\\/g, "/");
      checkPath.convert = makePosix;
      const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
      checkPath.isNotRelative = (path) => REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
    };
    if (
      // Detect `process` so that it can run in browsers.
      typeof process !== "undefined" && process.platform === "win32"
    ) {
      setupWindows();
    }
    module2.exports = factory;
    factory.default = factory;
    module2.exports.isPathValid = isPathValid;
    define(module2.exports, /* @__PURE__ */ Symbol.for("setupWindows"), setupWindows);
  }
});

// src/action/main.ts
var main_exports = {};
__export(main_exports, {
  checkoutBaseWithGit: () => checkoutBaseWithGit,
  run: () => run
});
module.exports = __toCommonJS(main_exports);
var import_node_fs4 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path9 = require("node:path");

// src/engine/exec.ts
var import_node_child_process = require("node:child_process");
var CancelledError = class extends Error {
  constructor(message = "Cancelled.") {
    super(message);
    this.name = "CancelledError";
  }
};
var SAFE_SHELL_ARG = /^[A-Za-z0-9@._/=~:-]+$/;
function killProcessTree(child) {
  if (process.platform === "win32" && child.pid !== void 0) {
    (0, import_node_child_process.spawn)("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true
    });
    return;
  }
  child.kill();
}
function runProcess(command, args, options) {
  return new Promise((resolve2, reject) => {
    const { cwd, signal } = options;
    const env = options.env ? { ...process.env, ...options.env } : void 0;
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    let child;
    if (process.platform === "win32") {
      const unsafe = [command, ...args].find((arg) => !SAFE_SHELL_ARG.test(arg));
      if (unsafe !== void 0) {
        reject(new Error(`Refusing to pass unsafe argument to the shell: ${unsafe}`));
        return;
      }
      child = (0, import_node_child_process.spawn)([command, ...args].join(" "), {
        cwd,
        env,
        shell: true,
        windowsHide: true
      });
    } else {
      child = (0, import_node_child_process.spawn)(command, args, { cwd, env });
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", abortHandler);
      fn();
    };
    const abortHandler = () => {
      killProcessTree(child);
      settle(() => reject(new CancelledError()));
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (data) => {
      stdout += data;
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      settle(() => resolve2({ code, stdout, stderr }));
    });
  });
}

// src/engine/scan.ts
var import_node_fs3 = require("node:fs");
var import_node_path8 = require("node:path");

// src/engine/footprint.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var import_semver = __toESM(require_semver2());
var SEVERITIES = ["critical", "high", "moderate", "low"];
var BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
var ADVISORY_TIMEOUT_MS = 15e3;
var fetchRegistryAdvisories = async (request, signal) => {
  const timeout = AbortSignal.timeout(ADVISORY_TIMEOUT_MS);
  const response = await fetch(BULK_ADVISORY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  });
  if (!response.ok) {
    throw new Error(`the npm registry answered ${response.status}`);
  }
  return await response.json();
};
var advisoryCache = /* @__PURE__ */ new Map();
async function readJson(path) {
  try {
    return JSON.parse(await (0, import_promises.readFile)(path, "utf8"));
  } catch {
    return void 0;
  }
}
function names(manifest, sections) {
  return sections.flatMap((section) => {
    const deps = manifest[section];
    return deps && typeof deps === "object" ? Object.keys(deps) : [];
  });
}
var NODE_MODULES_SEGMENT = `${import_node_path.sep}node_modules${import_node_path.sep}`;
var InstalledTree = class {
  nodes = /* @__PURE__ */ new Map();
  resolved = /* @__PURE__ */ new Map();
  // Node's lookup: `<dir>/node_modules/<name>`, then each parent dir. Works for
  // pnpm too, because a package's real path sits next to its dependencies.
  async resolve(fromDir, name) {
    const cacheKey = `${fromDir}\0${name}`;
    if (this.resolved.has(cacheKey)) {
      return this.resolved.get(cacheKey);
    }
    let dir = fromDir;
    let found;
    for (; ; ) {
      if ((0, import_node_path.basename)(dir) !== "node_modules") {
        try {
          const real = await (0, import_promises.realpath)((0, import_node_path.join)(dir, "node_modules", name));
          if (await readJson((0, import_node_path.join)(real, "package.json"))) {
            found = real;
            break;
          }
        } catch {
        }
      }
      const parent = (0, import_node_path.dirname)(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    this.resolved.set(cacheKey, found);
    return found;
  }
  // Loads `dir` and everything it depends on.
  async load(start, signal) {
    const queue = [start];
    while (queue.length > 0) {
      signal?.throwIfAborted();
      const dir = queue.pop();
      if (this.nodes.has(dir)) {
        continue;
      }
      const manifest = await readJson((0, import_node_path.join)(dir, "package.json")) ?? {};
      const node = {
        name: typeof manifest.name === "string" ? manifest.name : (0, import_node_path.basename)(dir),
        version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
        dir,
        local: !`${dir}${import_node_path.sep}`.includes(NODE_MODULES_SEGMENT),
        deps: []
      };
      this.nodes.set(dir, node);
      if (node.local) {
        continue;
      }
      for (const name of names(manifest, ["dependencies", "optionalDependencies", "peerDependencies"])) {
        const dep = await this.resolve(dir, name);
        if (dep) {
          node.deps.push(dep);
          queue.push(dep);
        }
      }
    }
  }
  reachable(starts) {
    const seen = /* @__PURE__ */ new Set();
    const queue = [...starts];
    while (queue.length > 0) {
      const dir = queue.pop();
      if (seen.has(dir)) {
        continue;
      }
      seen.add(dir);
      queue.push(...this.nodes.get(dir)?.deps ?? []);
    }
    return seen;
  }
};
async function directorySize(dir, signal) {
  let total = 0;
  let entries;
  try {
    entries = await (0, import_promises.readdir)(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    signal?.throwIfAborted();
    const path = (0, import_node_path.join)(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        total += await directorySize(path, signal);
      }
    } else if (entry.isFile()) {
      try {
        total += (await (0, import_promises.lstat)(path)).size;
      } catch {
      }
    }
  }
  return total;
}
function toAdvisories(name, version, raw) {
  return raw.filter((advisory) => {
    try {
      return Boolean(advisory.vulnerable_versions) && import_semver.default.satisfies(version, advisory.vulnerable_versions, { includePrerelease: true });
    } catch {
      return false;
    }
  }).map((advisory) => ({
    package: name,
    version,
    severity: SEVERITIES.find((level) => level === advisory.severity) ?? "low",
    title: advisory.title ?? "Known vulnerability",
    url: advisory.url ?? ""
  }));
}
async function lookUpAdvisories(nodes, fetcher, signal) {
  const request = {};
  for (const { name, version } of nodes) {
    if (!advisoryCache.has(`${name}@${version}`)) {
      request[name] = [.../* @__PURE__ */ new Set([...request[name] ?? [], version])];
    }
  }
  if (Object.keys(request).length === 0) {
    return;
  }
  const response = await fetcher(request, signal);
  for (const [name, versions] of Object.entries(request)) {
    for (const version of versions) {
      advisoryCache.set(`${name}@${version}`, toAdvisories(name, version, response[name] ?? []));
    }
  }
}
var EMPTY = { packages: 0, bytes: 0, advisories: [] };
async function measureFootprints(projectRoot, manifestDirs, removals, { signal, fetchAdvisories = fetchRegistryAdvisories } = {}) {
  const warnings = [];
  const tree = new InstalledTree();
  const roots = [];
  for (const manifestDir of /* @__PURE__ */ new Set(["", ...manifestDirs])) {
    const manifest = await readJson((0, import_node_path.join)(projectRoot, manifestDir, "package.json"));
    if (!manifest) {
      continue;
    }
    for (const name of names(manifest, ["dependencies", "devDependencies", "optionalDependencies"])) {
      const dir = await tree.resolve((0, import_node_path.join)(projectRoot, manifestDir), name);
      if (dir) {
        roots.push({ manifestDir, name, dir });
        await tree.load(dir, signal);
      }
    }
  }
  if (roots.length === 0) {
    return { perRemoval: /* @__PURE__ */ new Map(), combined: EMPTY, warnings };
  }
  const all = tree.reachable(roots.map((root) => root.dir));
  const goneWithout = (removed) => {
    const isRemoved = (root) => removed.some((removal) => removal.manifestDir === root.manifestDir && removal.name === root.name);
    const kept = tree.reachable(roots.filter((root) => !isRemoved(root)).map((root) => root.dir));
    return new Set([...all].filter((dir) => !kept.has(dir) && !tree.nodes.get(dir)?.local));
  };
  const combinedGone = goneWithout(removals);
  const perRemovalGone = new Map(removals.map((removal) => [removal.id, goneWithout([removal])]));
  const sizes = /* @__PURE__ */ new Map();
  for (const dir of combinedGone) {
    sizes.set(dir, await directorySize(dir, signal));
  }
  const goneNodes = [...combinedGone].map((dir) => tree.nodes.get(dir));
  let advisoriesKnown = false;
  if (fetchAdvisories && goneNodes.length > 0) {
    try {
      await lookUpAdvisories(goneNodes, fetchAdvisories, signal);
      advisoriesKnown = true;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      warnings.push(`Couldn't check unused packages for known vulnerabilities (${error.message}). Sizes are still shown.`);
    }
  }
  const footprintOf = (gone) => ({
    packages: gone.size,
    bytes: [...gone].reduce((sum, dir) => sum + (sizes.get(dir) ?? 0), 0),
    advisories: advisoriesKnown ? [...gone].flatMap((dir) => {
      const { name, version } = tree.nodes.get(dir);
      return advisoryCache.get(`${name}@${version}`) ?? [];
    }) : []
  });
  return {
    perRemoval: new Map([...perRemovalGone].map(([id, gone]) => [id, footprintOf(gone)])),
    combined: footprintOf(combinedGone),
    warnings
  };
}
function countBySeverity(advisories) {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const advisory of advisories) {
    counts[advisory.severity]++;
  }
  return counts;
}
function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
function describeAdvisories(advisories) {
  if (advisories.length === 0) {
    return "no known vulnerabilities";
  }
  const counts = countBySeverity(advisories);
  const parts = SEVERITIES.filter((level) => counts[level] > 0).map((level) => `${counts[level]} ${level}`);
  return `${advisories.length} known ${advisories.length === 1 ? "vulnerability" : "vulnerabilities"} (${parts.join(", ")})`;
}

// src/engine/confidence.ts
var import_node_path3 = require("node:path");

// src/engine/project.ts
var import_promises2 = require("node:fs/promises");
var import_node_path2 = require("node:path");
var import_ignore = __toESM(require_ignore());

// src/engine/dynamicImports.ts
var CALL_PATTERN = /\b(?:import|require)\s*\(/g;
function skipTrivia(source, index) {
  let i = index;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i + 2);
      i = end === -1 ? source.length : end + 1;
    } else {
      break;
    }
  }
  return i;
}
function readLiteral(source, index) {
  const quote = source[index];
  let text = "";
  let i = index + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      text += source[i + 1] ?? "";
      i += 2;
    } else if (char === quote) {
      return { text, end: i + 1, interpolated: false };
    } else if (quote === "`" && source.startsWith("${", i)) {
      return { text, end: i, interpolated: true };
    } else if (char === "\n" && quote !== "`") {
      return void 0;
    } else {
      text += char;
      i++;
    }
  }
  return void 0;
}
function extractDynamicImportPrefixes(source) {
  const prefixes = [];
  for (const match of source.matchAll(CALL_PATTERN)) {
    if (source[match.index - 1] === ".") {
      continue;
    }
    const argStart = skipTrivia(source, match.index + match[0].length);
    const first = source[argStart];
    if (first === ")" || first === void 0) {
      continue;
    }
    if (first !== '"' && first !== "'" && first !== "`") {
      prefixes.push("");
      continue;
    }
    const literal = readLiteral(source, argStart);
    if (!literal) {
      prefixes.push("");
      continue;
    }
    if (literal.interpolated) {
      prefixes.push(literal.text);
      continue;
    }
    const next = source[skipTrivia(source, literal.end)];
    if (next !== ")" && next !== ",") {
      prefixes.push(literal.text);
    }
  }
  return prefixes;
}

// src/engine/project.ts
var TRASH_DIR = ".deadweight-trash";
var ALWAYS_SKIPPED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  TRASH_DIR,
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "coverage",
  ".deadweight"
  // generated project maps for AI agents
]);
var SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
var CONFIG_FILE = /\.config\.(?:[cm]?[jt]s|json|ya?ml)$|^\.[\w.-]*rc(?:\.(?:[cm]?[jt]s|json|ya?ml))?$|^(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/;
var CI_FILE = /^(?:\.github\/workflows\/.+\.ya?ml|\.gitlab-ci\.ya?ml|\.circleci\/config\.ya?ml|azure-pipelines\.ya?ml|bitbucket-pipelines\.ya?ml|\.travis\.ya?ml|Jenkinsfile|Dockerfile|Makefile)$/;
var MAX_SCANNED_FILE_BYTES = 1024 * 1024;
function isIgnored(path, isDir, scopes) {
  return scopes.some(({ base, rules }) => {
    const relative = base ? path.slice(base.length + 1) : path;
    return rules.ignores(isDir ? `${relative}/` : relative);
  });
}
async function readIgnoreScope(root, dir) {
  try {
    const text = await (0, import_promises2.readFile)((0, import_node_path2.join)(root, dir, ".gitignore"), "utf8");
    return { base: dir, rules: (0, import_ignore.default)().add(text) };
  } catch {
    return void 0;
  }
}
async function listFiles(root, signal) {
  const files = [];
  const walk = async (dir, scopes) => {
    signal?.throwIfAborted();
    const scope = await readIgnoreScope(root, dir);
    const activeScopes = scope ? [...scopes, scope] : scopes;
    let entries;
    try {
      entries = await (0, import_promises2.readdir)((0, import_node_path2.join)(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!ALWAYS_SKIPPED_DIRS.has(entry.name) && !isIgnored(path, true, activeScopes)) {
          await walk(path, activeScopes);
        }
      } else if (entry.isFile() && !isIgnored(path, false, activeScopes)) {
        files.push(path);
      }
    }
  };
  await walk("", []);
  return files;
}
var MAX_PROJECT_DEPTH = 6;
async function findProjectRoots(root, signal) {
  const projects = [];
  const walk = async (dir, scopes, depth) => {
    signal?.throwIfAborted();
    let entries;
    try {
      entries = await (0, import_promises2.readdir)((0, import_node_path2.join)(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
      projects.push(dir);
      return;
    }
    if (depth >= MAX_PROJECT_DEPTH) {
      return;
    }
    const scope = await readIgnoreScope(root, dir);
    const activeScopes = scope ? [...scopes, scope] : scopes;
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !entry.name.startsWith(".") && !ALWAYS_SKIPPED_DIRS.has(entry.name) && !isIgnored(path, true, activeScopes)) {
        await walk(path, activeScopes, depth + 1);
      }
    }
  };
  await walk("", [], 0);
  return projects.sort();
}
async function readSmallFile(path) {
  try {
    if ((await (0, import_promises2.stat)(path)).size > MAX_SCANNED_FILE_BYTES) {
      return void 0;
    }
    return await (0, import_promises2.readFile)(path, "utf8");
  } catch {
    return void 0;
  }
}
async function collectProjectContext(root, signal) {
  const files = await listFiles(root, signal);
  const identifierFileCounts = /* @__PURE__ */ new Map();
  const context = {
    sourceFileCount: 0,
    identifierFileCounts,
    workspaceDirs: [],
    dynamicImports: [],
    scripts: [],
    ci: [],
    configs: []
  };
  for (const file of files) {
    signal?.throwIfAborted();
    const name = import_node_path2.posix.basename(file);
    const isSource = SOURCE_FILE.test(file);
    const isConfig = CONFIG_FILE.test(name);
    const isCi = CI_FILE.test(file);
    const isManifest = name === "package.json";
    if (!isSource && !isConfig && !isCi && !isManifest) {
      continue;
    }
    const text = await readSmallFile((0, import_node_path2.join)(root, file));
    if (text === void 0) {
      continue;
    }
    if (isSource) {
      context.sourceFileCount++;
      for (const word of new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
        identifierFileCounts.set(word, (identifierFileCounts.get(word) ?? 0) + 1);
      }
      for (const prefix of extractDynamicImportPrefixes(text)) {
        context.dynamicImports.push({ file, prefix });
      }
    }
    if (isConfig) {
      context.configs.push({ source: file, text });
    }
    if (isCi) {
      context.ci.push({ source: file, text });
    }
    if (isManifest) {
      const dir = import_node_path2.posix.dirname(file);
      context.workspaceDirs.push(dir === "." ? "" : dir);
      try {
        const {
          scripts,
          dependencies: _dependencies,
          devDependencies: _devDependencies,
          peerDependencies: _peerDependencies,
          optionalDependencies: _optionalDependencies,
          ...rest
        } = JSON.parse(text);
        if (scripts && typeof scripts === "object") {
          context.scripts.push({
            source: file,
            text: Object.values(scripts).filter((s) => typeof s === "string").join("\n")
          });
        }
        context.configs.push({ source: file, text: JSON.stringify(rest, null, 1) });
      } catch {
      }
    }
  }
  return context;
}
async function readInstalledPackage(root, workspaceDir, packageName) {
  for (const dir of /* @__PURE__ */ new Set([(0, import_node_path2.join)(root, workspaceDir), root])) {
    try {
      const manifest = JSON.parse(
        await (0, import_promises2.readFile)((0, import_node_path2.join)(dir, "node_modules", packageName, "package.json"), "utf8")
      );
      const bins = typeof manifest.bin === "string" ? [import_node_path2.posix.basename(packageName)] : manifest.bin && typeof manifest.bin === "object" ? Object.keys(manifest.bin) : [];
      const peers = manifest.peerDependencies && typeof manifest.peerDependencies === "object" ? Object.keys(manifest.peerDependencies) : [];
      return { bins, peers };
    } catch {
    }
  }
  return void 0;
}
async function readDeclaredDependencies(root, manifest) {
  try {
    const json = JSON.parse(await (0, import_promises2.readFile)((0, import_node_path2.join)(root, manifest), "utf8"));
    return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((section) => {
      const deps = json[section];
      return deps && typeof deps === "object" ? Object.keys(deps) : [];
    });
  } catch {
    return [];
  }
}

// src/engine/confidence.ts
var TOOL_CONFIG_FILES = [
  ["eslint", /^(?:\.eslintrc(?:\.\w+)?|eslint\.config\.[cm]?[jt]s)$/],
  ["prettier", /^(?:\.prettierrc(?:\.\w+)?|prettier\.config\.[cm]?[jt]s)$/],
  ["typescript", /^tsconfig(?:\.[\w-]+)?\.json$/],
  ["@babel/core", /^(?:\.babelrc(?:\.\w+)?|babel\.config\.\w+)$/],
  ["jest", /^jest\.config\.\w+$/],
  ["vitest", /^vitest\.config\.\w+$/],
  ["vite", /^vite\.config\.\w+$/],
  ["postcss", /^(?:postcss\.config\.\w+|\.postcssrc(?:\.\w+)?)$/],
  ["tailwindcss", /^tailwind\.config\.\w+$/],
  ["stylelint", /^(?:\.stylelintrc(?:\.\w+)?|stylelint\.config\.\w+)$/],
  ["webpack", /^webpack\.config\.\w+$/],
  ["rollup", /^rollup\.config\.\w+$/],
  ["next", /^next\.config\.\w+$/],
  ["@commitlint/cli", /^(?:\.commitlintrc(?:\.\w+)?|commitlint\.config\.\w+)$/],
  ["lint-staged", /^(?:\.lintstagedrc(?:\.\w+)?|lint-staged\.config\.\w+)$/]
];
var PLUGIN_PACKAGE = [
  /(?:^|\/)eslint-(?:plugin|config)(?:-|$)/,
  /(?:^|\/)babel-(?:plugin|preset)-/,
  /^@babel\/(?:plugin|preset)-/,
  /(?:^|\/)prettier-plugin-/,
  /(?:^|\/)stylelint-(?:plugin|config)(?:-|$)/,
  /(?:^|\/)postcss-/,
  /(?:^|\/)(?:remark|rehype)-/,
  /^@commitlint\//,
  /(?:^|\/)(?:vite|rollup)-plugin-/,
  /^@(?:vitejs|rollup)\/plugin-/,
  /-loader$/
];
var BARREL_FILE = /^index\.[cm]?[jt]sx?$/;
var ALIAS_PREFIX = /^(?:\/|@\/|~\/|#|\$)/;
var START = { high: 90, medium: 70, low: 40 };
var CEILING = { high: 99, medium: 79, low: 49 };
var AGREEMENT_BONUS = 8;
var RISK_PENALTY = 5;
function confidenceOf(score) {
  return score >= 80 ? "high" : score >= 50 ? "medium" : "low";
}
var Assessment = class {
  notes = [];
  score;
  ceiling;
  constructor(level, note) {
    this.score = START[level];
    this.ceiling = CEILING[level];
    this.notes.push(note);
  }
  // Independent evidence that the item really is unused.
  confirm(note) {
    this.score = Math.min(this.score + AGREEMENT_BONUS, this.ceiling);
    this.notes.push(note);
  }
  // A reason it might still be in use: caps the band and costs points.
  cap(level, note) {
    this.ceiling = Math.min(this.ceiling, CEILING[level]);
    this.score = Math.max(1, Math.min(this.score, this.ceiling) - RISK_PENALTY);
    this.notes.push(note);
  }
  get level() {
    return confidenceOf(this.score);
  }
  get value() {
    return this.score;
  }
  get reason() {
    return `${this.notes.join(". ")}.`;
  }
};
var lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mentions(text, token) {
  return new RegExp(
    `(?:^|[\\s"'\`(/=,:;&|])${escapeRegExp(token)}(?:$|[\\s"'\`)/@,;:&|?#])`,
    "m"
  ).test(text);
}
function findMention(sources, tokens) {
  return sources.find(({ text }) => tokens.some((token) => mentions(text, token)));
}
function workspaceOf(path, workspaceDirs) {
  return workspaceDirs.filter((dir) => dir !== "" && path.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0] ?? "";
}
function resolveDynamicImport({ file, prefix }) {
  if (prefix === "" || ALIAS_PREFIX.test(prefix)) {
    return { scope: "unknown" };
  }
  if (prefix.startsWith(".")) {
    const path = import_node_path3.posix.join(import_node_path3.posix.dirname(file), prefix).replace(/^\.\/?/, "");
    return { scope: "relative", path };
  }
  return { scope: "bare", prefix };
}
function describeImport({ file, prefix }) {
  return prefix ? `${file} has a computed import starting with "${prefix}"` : `${file} has a fully computed import/require`;
}
function scannedFiles(count2) {
  return `${count2} scanned ${count2 === 1 ? "file" : "files"}`;
}
function scorePackage(finding, input2, dynamicImports, unresolvedWorkspaces) {
  const { context, depcheckUnused } = input2;
  const { name } = finding;
  const workspace = finding.workspace ?? "";
  const base = `No import found across ${scannedFiles(context.sourceFileCount)}`;
  let assessment;
  if (workspace) {
    assessment = new Assessment(
      "medium",
      `${base}. In monorepo workspace ${workspace}; cross-workspace usage isn't verified yet`
    );
  } else if (!depcheckUnused) {
    assessment = new Assessment("medium", `${base}. depcheck didn't run, so there is no second opinion`);
  } else if (depcheckUnused.has(name)) {
    assessment = new Assessment("high", `${base}; depcheck agrees`);
  } else {
    assessment = new Assessment("low", `${base}, but depcheck found it in use`);
  }
  const node = input2.graph?.get(`package:${name}`);
  if (node?.status === "unused") {
    assessment.confirm(`Deadweight's graph agrees: ${lowerFirst(node.reason)}`);
  } else if (node?.status === "maybe") {
    assessment.cap("medium", `Deadweight's graph can't rule out use: ${lowerFirst(node.reason)}`);
  } else if (node) {
    assessment.cap("low", `Deadweight's graph found it in use: ${lowerFirst(node.reason)}`);
  }
  if (name.startsWith("@types/")) {
    assessment.cap("low", "Type-only package; TypeScript can use it without any import");
  }
  if (PLUGIN_PACKAGE.some((pattern) => pattern.test(name))) {
    assessment.cap("medium", "Looks like a plugin or preset, which tools load by name from config");
  }
  const info = input2.packageInfo.get(finding.id);
  if (info?.peerOf) {
    assessment.cap("low", `Peer dependency of ${info.peerOf}, which loads it without an import in your code`);
  }
  const toolConfig = TOOL_CONFIG_FILES.filter(([packageName]) => packageName === name).flatMap(([, pattern]) => context.configs.filter(({ source }) => pattern.test(import_node_path3.posix.basename(source))))[0];
  if (toolConfig) {
    assessment.cap("medium", `${toolConfig.source} exists, so ${name} is probably run by a tool or editor`);
  }
  const inConfig = findMention(context.configs, [name]);
  if (inConfig) {
    assessment.cap("medium", `Referenced by name in ${inConfig.source}`);
  }
  const commands = [name, ...info?.bins ?? []];
  const inScripts = findMention(context.scripts, commands);
  if (inScripts) {
    assessment.cap("medium", `Used in the scripts of ${inScripts.source}`);
  }
  const inCi = findMention(context.ci, commands);
  if (inCi) {
    assessment.cap("medium", `Referenced in CI config ${inCi.source}`);
  }
  const unresolvedFile = unresolvedWorkspaces.get(workspace);
  if (unresolvedFile) {
    assessment.cap("low", `Knip couldn't resolve some imports in this workspace (e.g. ${unresolvedFile})`);
  }
  const dynamic = dynamicImports.find(
    ({ resolved }) => resolved.scope === "unknown" || resolved.scope === "bare" && (name.startsWith(resolved.prefix) || resolved.prefix.startsWith(`${name}/`))
  );
  if (dynamic) {
    assessment.cap("low", `May be loaded dynamically: ${describeImport(dynamic.source)}`);
  }
  return assessment;
}
function scoreFile(finding, input2, dynamicImports, unresolvedWorkspaces) {
  const path = finding.name;
  const assessment = new Assessment(
    "high",
    `No import found across ${scannedFiles(input2.context.sourceFileCount)}`
  );
  const node = input2.graph?.get(`file:${path}`);
  if (node?.status === "unused") {
    assessment.confirm(`Deadweight's graph agrees: ${lowerFirst(node.reason)}`);
  } else if (node?.status === "maybe") {
    assessment.cap("low", `Deadweight's graph can't rule out use: ${lowerFirst(node.reason)}`);
  } else if (node) {
    assessment.cap("low", `Deadweight's graph found it in use: ${lowerFirst(node.reason)}`);
  }
  applyFileRisks(assessment, path, input2, dynamicImports, unresolvedWorkspaces);
  return assessment;
}
function scoreExport(finding, input2, dynamicImports, unresolvedWorkspaces) {
  const { name } = finding;
  const path = finding.file ?? "";
  const label = name === "default" ? "The default export" : `"${name}"`;
  const assessment = new Assessment("high", `${label} is exported from ${path}, but no file imports it`);
  const counts = input2.context.identifierFileCounts;
  if (counts && name !== "default") {
    const others = Math.max(0, (counts.get(name) ?? 1) - 1);
    if (others === 0) {
      assessment.confirm(`The name "${name}" appears in no other file`);
    } else {
      assessment.cap("medium", `The name "${name}" also appears in ${others} other file${others === 1 ? "" : "s"}, so it may be used indirectly`);
    }
  }
  const node = input2.graph?.get(`file:${path}`);
  if (node?.status === "maybe") {
    assessment.cap("low", `${path} may be loaded by a computed import, which can reach any export`);
  } else if (node?.status === "entry") {
    assessment.cap("medium", `${path} is an entry point, so its exports may be public API`);
  }
  applyFileRisks(assessment, path, input2, dynamicImports, unresolvedWorkspaces);
  return assessment;
}
function applyFileRisks(assessment, path, input2, dynamicImports, unresolvedWorkspaces) {
  const { context } = input2;
  const workspace = workspaceOf(path, context.workspaceDirs);
  if (workspace) {
    assessment.cap("medium", `In monorepo workspace ${workspace}; cross-workspace usage isn't verified yet`);
  }
  if (BARREL_FILE.test(import_node_path3.posix.basename(path))) {
    assessment.cap("medium", "Barrel file; chained re-exports can look unused");
  }
  const withoutExtension = path.replace(/\.[^./]+$/, "");
  const tokens = [path, withoutExtension];
  if (workspace) {
    tokens.push(path.slice(workspace.length + 1), withoutExtension.slice(workspace.length + 1));
  }
  const reference = findMention([...context.configs, ...context.scripts, ...context.ci], tokens);
  if (reference) {
    assessment.cap("low", `Referenced from ${reference.source}`);
  }
  const unresolvedFile = unresolvedWorkspaces.get(workspace);
  if (unresolvedFile) {
    assessment.cap("low", `Knip couldn't resolve some imports in this workspace (e.g. ${unresolvedFile})`);
  }
  const dynamic = dynamicImports.find(
    ({ resolved }) => resolved.scope === "unknown" || resolved.scope === "relative" && path.startsWith(resolved.path)
  );
  if (dynamic) {
    assessment.cap("low", `May be loaded dynamically: ${describeImport(dynamic.source)}`);
  }
}
function scoreFindings(findings, input2) {
  const { context } = input2;
  const dynamicImports = context.dynamicImports.map((source) => ({
    source,
    resolved: resolveDynamicImport(source)
  }));
  const unresolvedWorkspaces = /* @__PURE__ */ new Map();
  for (const file of input2.unresolvedFiles) {
    const workspace = workspaceOf(file, context.workspaceDirs);
    if (!unresolvedWorkspaces.has(workspace)) {
      unresolvedWorkspaces.set(workspace, file);
    }
  }
  const unusedFiles = new Set(findings.filter((f) => f.kind === "file").map((f) => f.name));
  const inTrash = (path) => path?.startsWith(`${TRASH_DIR}/`) ?? false;
  return findings.filter((finding) => finding.kind === "file" ? !inTrash(finding.name) : finding.kind === "export" ? !inTrash(finding.file) && !unusedFiles.has(finding.file ?? "") : true).map((finding) => {
    const assessment = finding.kind === "package" ? scorePackage(finding, input2, dynamicImports, unresolvedWorkspaces) : finding.kind === "export" ? scoreExport(finding, input2, dynamicImports, unresolvedWorkspaces) : scoreFile(finding, input2, dynamicImports, unresolvedWorkspaces);
    return { ...finding, confidence: assessment.level, score: assessment.value, reason: assessment.reason };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// src/engine/depcheck.ts
var DEPCHECK_ARGS = [
  "--yes",
  "depcheck@1",
  "--json",
  "--skip-missing",
  "--ignore-patterns=.deadweight-trash"
];
function parseDepcheckOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("depcheck returned invalid JSON output.");
  }
  const { dependencies, devDependencies } = parsed ?? {};
  if (!Array.isArray(dependencies) || !Array.isArray(devDependencies)) {
    throw new Error("depcheck returned an unexpected JSON format.");
  }
  return new Set([...dependencies, ...devDependencies].map(String));
}
async function runDepcheck(workspaceRoot, signal) {
  const { code, stdout, stderr } = await runProcess("npx", DEPCHECK_ARGS, {
    cwd: workspaceRoot,
    signal
  });
  if (!stdout.trim()) {
    throw new Error(
      stderr.trim() || `depcheck exited with code ${code ?? "unknown"}.`
    );
  }
  return {
    unused: parseDepcheckOutput(stdout),
    warnings: stderr.trim() ? [stderr.trim()] : []
  };
}

// src/engine/filters.ts
var import_ignore2 = __toESM(require_ignore());
function createMatcher(patterns) {
  const cleaned = patterns.map((pattern) => pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
  if (cleaned.length === 0) {
    return () => false;
  }
  const rules = (0, import_ignore2.default)().add(cleaned);
  return (path) => {
    try {
      return rules.ignores(path);
    } catch {
      return false;
    }
  };
}
function filterFindings(findings, { exclude = [], entryPoints = [] }) {
  const isExcluded = createMatcher(exclude);
  const isEntryPoint = createMatcher(entryPoints);
  return findings.filter((finding) => {
    const path = finding.kind === "export" ? finding.file ?? "" : finding.name;
    return !isExcluded(path) && !(finding.kind === "file" && isEntryPoint(path));
  });
}

// src/engine/graph.ts
var import_node_path5 = require("node:path");

// src/engine/imports.ts
function stripComments(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out.push(" ".repeat(stop - i));
      i = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out.push(source.slice(i, stop).replace(/[^\n]/g, " "));
      i = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;
      while (j < n && source[j] !== char) {
        if (source[j] === "\\") {
          j++;
        } else if (char !== "`" && source[j] === "\n") {
          break;
        }
        j++;
      }
      out.push(source.slice(i, j + 1));
      i = j + 1;
    } else {
      out.push(char);
      i++;
    }
  }
  return out.join("");
}
var IMPORT_FROM = /(?:^|[^\w$.])import\s+(type\s+)?(?:[\w$*{}\s,]+?\s+from\s*)?(['"])([^'"\n]+)\2/g;
var EXPORT_FROM = /(?:^|[^\w$.])export\s+(type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\2/g;
var CALL = /(?:^|[^\w$.])(require|import)\s*\(\s*(?:(['"])([^'"\n]+)\2|`([^`$\\]*)`)\s*[,)]/g;
var REQUIRE_RESOLVE = /(?:^|[^\w$.])require\.resolve\s*\(\s*(['"])([^'"\n]+)\1/g;
function extractImports(source) {
  const code = stripComments(source);
  const imports = [];
  for (const match of code.matchAll(IMPORT_FROM)) {
    imports.push({ specifier: match[3], kind: match[1] ? "type" : "static" });
  }
  for (const match of code.matchAll(EXPORT_FROM)) {
    imports.push({ specifier: match[3], kind: match[1] ? "type" : "static" });
  }
  for (const match of code.matchAll(CALL)) {
    imports.push({
      specifier: match[3] ?? match[4],
      kind: match[1] === "require" ? "require" : "dynamic"
    });
  }
  for (const match of code.matchAll(REQUIRE_RESOLVE)) {
    imports.push({ specifier: match[2], kind: "require" });
  }
  return {
    imports: imports.filter(({ specifier }) => specifier.trim() !== ""),
    dynamicPrefixes: extractDynamicImportPrefixes(code)
  };
}

// src/engine/resolver.ts
var import_node_module = require("node:module");
var import_node_path4 = require("node:path");
var RESOLVE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".json"
];
var JS_TO_TS = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var BUILTINS = new Set(import_node_module.builtinModules);
var ALIAS_LIKE = /^(?:@\/|~|#|\$)/;
function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
function manifestEntryPaths(manifest) {
  const paths = [];
  const collect = (value) => {
    if (typeof value === "string") {
      paths.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  for (const field of ["source", "main", "module", "browser", "exports", "bin"]) {
    collect(manifest[field]);
  }
  return paths.filter((path) => !path.includes("*"));
}
var Resolver = class {
  constructor(files, aliases, workspacePackages) {
    this.files = files;
    this.aliases = aliases;
    this.workspacePackages = workspacePackages;
  }
  files;
  aliases;
  workspacePackages;
  resolve(fromFile, rawSpecifier) {
    const specifier = rawSpecifier.split(/[?#]/)[0];
    if (!specifier) {
      return { kind: "unresolved" };
    }
    if (specifier.startsWith("node:") || BUILTINS.has(specifier) || BUILTINS.has(packageNameOf(specifier))) {
      return { kind: "builtin" };
    }
    if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../")) {
      return this.resolvePath(import_node_path4.posix.join(import_node_path4.posix.dirname(fromFile), specifier)) ?? { kind: "unresolved" };
    }
    if (specifier.startsWith("/")) {
      return this.resolvePath(specifier.slice(1)) ?? { kind: "unresolved" };
    }
    const aliases = this.nearestAliases(import_node_path4.posix.dirname(fromFile));
    if (aliases) {
      for (const { pattern, targets } of aliases.paths) {
        const captured = matchPattern(pattern, specifier);
        if (captured === void 0) {
          continue;
        }
        for (const target of targets) {
          const hit = this.resolvePath(target.replace("*", captured));
          if (hit) {
            return hit;
          }
        }
      }
      if (aliases.baseUrl !== void 0) {
        const hit = this.resolvePath(import_node_path4.posix.join(aliases.baseUrl, specifier));
        if (hit) {
          return hit;
        }
      }
    }
    const name = packageNameOf(specifier);
    const local = this.workspacePackages.get(name);
    if (local) {
      const subpath = specifier.slice(name.length + 1);
      const hit = subpath ? this.resolvePath(import_node_path4.posix.join(local.dir, subpath)) : this.resolvePackageEntry(local);
      return hit ?? { kind: "package", name };
    }
    if (ALIAS_LIKE.test(specifier)) {
      return { kind: "unresolved" };
    }
    return { kind: "package", name };
  }
  // A path relative to the workspace root, with or without extension, or a directory.
  resolvePath(rawPath) {
    const path = import_node_path4.posix.normalize(rawPath).replace(/^\.\//, "").replace(/\/$/, "");
    if (path.startsWith("..")) {
      return void 0;
    }
    if (this.files.has(path)) {
      return RESOLVE_EXTENSIONS.includes(import_node_path4.posix.extname(path)) || /\.[cm]?[jt]sx?$/.test(path) ? { kind: "file", path } : { kind: "asset" };
    }
    const extension = import_node_path4.posix.extname(path);
    for (const replacement of JS_TO_TS[extension] ?? []) {
      const candidate = path.slice(0, -extension.length) + replacement;
      if (this.files.has(candidate)) {
        return { kind: "file", path: candidate };
      }
    }
    for (const candidateExtension of RESOLVE_EXTENSIONS) {
      if (this.files.has(path + candidateExtension)) {
        return { kind: "file", path: path + candidateExtension };
      }
    }
    const dir = path === "." ? "" : path;
    for (const candidateExtension of RESOLVE_EXTENSIONS) {
      const index = import_node_path4.posix.join(dir, `index${candidateExtension}`);
      if (this.files.has(index)) {
        return { kind: "file", path: index };
      }
    }
    return void 0;
  }
  resolvePackageEntry(local) {
    for (const entry of manifestEntryPaths(local.manifest)) {
      const hit = this.resolvePath(import_node_path4.posix.join(local.dir, entry));
      if (hit?.kind === "file") {
        return hit;
      }
    }
    return this.resolvePath(import_node_path4.posix.join(local.dir, "src/index")) ?? this.resolvePath(import_node_path4.posix.join(local.dir, "index"));
  }
  nearestAliases(dir) {
    let current = dir === "." ? "" : dir;
    for (; ; ) {
      const found = this.aliases.get(current);
      if (found) {
        return found;
      }
      if (current === "") {
        return void 0;
      }
      const parent = import_node_path4.posix.dirname(current);
      current = parent === "." ? "" : parent;
    }
  }
};
function matchPattern(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star === -1) {
    return pattern === specifier ? "" : void 0;
  }
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
    return specifier.slice(prefix.length, specifier.length - suffix.length);
  }
  return void 0;
}
function parseJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        j += text[j] === "\\" ? 2 : 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (char === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += char;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
function loadPathAliases(configPath, readConfig, depth = 0) {
  const text = readConfig(configPath);
  if (text === void 0 || depth > 5) {
    return void 0;
  }
  let config;
  try {
    config = parseJsonc(text);
  } catch {
    return void 0;
  }
  const dir = import_node_path4.posix.dirname(configPath) === "." ? "" : import_node_path4.posix.dirname(configPath);
  const inherited = typeof config.extends === "string" && config.extends.startsWith(".") ? loadPathAliases(
    import_node_path4.posix.join(dir, config.extends.endsWith(".json") ? config.extends : `${config.extends}.json`),
    readConfig,
    depth + 1
  ) : void 0;
  const options = config.compilerOptions ?? {};
  const baseUrl = typeof options.baseUrl === "string" ? import_node_path4.posix.join(dir, options.baseUrl) : inherited?.baseUrl;
  if (!options.paths || typeof options.paths !== "object") {
    return inherited || baseUrl !== void 0 ? { baseUrl, paths: inherited?.paths ?? [] } : void 0;
  }
  const pathsBase = baseUrl ?? dir;
  const paths = Object.entries(options.paths).map(([pattern, targets]) => ({
    pattern,
    targets: (Array.isArray(targets) ? targets : []).filter((target) => typeof target === "string").map((target) => import_node_path4.posix.join(pathsBase, target))
  }));
  return { baseUrl, paths };
}

// src/engine/graph.ts
var TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__)\/|\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$/;
var DECLARATION_FILE = /\.d\.[cm]?ts$/;
var BUILD_OUTPUT = /^(?:dist|out|build|lib|es|esm|cjs)\/(.+)$/;
var DEFAULT_ENTRY = /^(?:src\/)?(?:index|main|cli|server|app)\.(?:[cm]?[jt]sx?)$/;
var FRAMEWORK_ENTRIES = [
  [/^next$/, /^(?:src\/)?(?:pages|app)\/|^(?:src\/)?(?:middleware|instrumentation)\.[cm]?[jt]sx?$/, "Next.js"],
  [/^nuxt$/, /^(?:pages|layouts|components|composables|plugins|middleware|server|utils)\/|^app\.vue$/, "Nuxt"],
  [/^@sveltejs\/kit$/, /^src\/(?:routes\/|hooks\.|app\.html)/, "SvelteKit"],
  [/^@remix-run\//, /^app\/(?:root|entry\.(?:client|server))\.|^app\/routes\//, "Remix"],
  [/^astro$/, /^src\/(?:pages|layouts|content)\//, "Astro"],
  [/^gatsby$/, /^src\/(?:pages|templates)\/|^gatsby-(?:browser|node|ssr)\./, "Gatsby"],
  [/^(?:expo|react-native)$/, /^(?:App|index)\.[cm]?[jt]sx?$|^app\//, "Expo / React Native"],
  [/^@angular\/core$/, /^src\/(?:main|polyfills)\.ts$/, "Angular"]
];
var HOST_PROVIDED = /* @__PURE__ */ new Set(["vscode", "electron"]);
var JSX_RUNTIMES = ["react", "react-dom", "preact", "solid-js"];
var PATH_LITERAL = /['"`]((?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[a-z]{1,5})['"`]/g;
var COMMAND_PATH = /(?:^|[\s"'=])((?:\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[cm]?[jt]sx?)(?=$|[\s"';&|)])/g;
var HTML_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
function workspaceOf2(path, workspaceDirs) {
  return workspaceDirs.find((dir) => dir !== "" && path.startsWith(`${dir}/`)) ?? "";
}
function relativeTo(dir, path) {
  return dir ? path.slice(dir.length + 1) : path;
}
function dependencyNames(manifest, sections) {
  return sections.flatMap((section) => {
    const deps = manifest[section];
    return deps && typeof deps === "object" ? Object.keys(deps) : [];
  });
}
function list(items, max = 3) {
  return items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");
}
async function buildConnectionGraph(root, options = {}) {
  const startedAt = Date.now();
  const { signal } = options;
  const allFiles = (await listFiles(root, signal)).filter((file) => !file.startsWith(`${TRASH_DIR}/`));
  const fileSet = new Set(allFiles);
  const readText = async (file) => readSmallFile((0, import_node_path5.join)(root, file));
  const manifests = /* @__PURE__ */ new Map();
  for (const file of allFiles.filter((f) => import_node_path5.posix.basename(f) === "package.json")) {
    try {
      const dir = import_node_path5.posix.dirname(file) === "." ? "" : import_node_path5.posix.dirname(file);
      manifests.set(dir, JSON.parse(await readText(file) ?? ""));
    } catch {
    }
  }
  const workspaceDirs = [...manifests.keys()].sort((a, b) => b.length - a.length);
  const workspacePackages = /* @__PURE__ */ new Map();
  for (const [dir, manifest] of manifests) {
    if (typeof manifest.name === "string") {
      workspacePackages.set(manifest.name, { dir, manifest });
    }
  }
  const configTexts = /* @__PURE__ */ new Map();
  for (const file of allFiles.filter((f) => /^(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/.test(import_node_path5.posix.basename(f)))) {
    const text = await readText(file);
    if (text !== void 0) {
      configTexts.set(file, text);
    }
  }
  const aliases = /* @__PURE__ */ new Map();
  for (const file of configTexts.keys()) {
    const name = import_node_path5.posix.basename(file);
    if (name !== "tsconfig.json" && name !== "jsconfig.json") {
      continue;
    }
    const loaded = loadPathAliases(file, (path) => configTexts.get(path));
    const dir = import_node_path5.posix.dirname(file) === "." ? "" : import_node_path5.posix.dirname(file);
    if (loaded && !aliases.has(dir)) {
      aliases.set(dir, loaded);
    }
  }
  const resolver = new Resolver(fileSet, aliases, workspacePackages);
  const sourceFiles = allFiles.filter((file) => SOURCE_FILE.test(file));
  const edges = [];
  const edgeKeys = /* @__PURE__ */ new Set();
  const unresolved = [];
  const fullyComputed = [];
  const packageImporters = /* @__PURE__ */ new Map();
  const addEdge = (from, to, kind) => {
    const key = `${from}>${to}`;
    if (from !== to && !edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to, kind });
    }
  };
  const configSources = [];
  for (const file of sourceFiles) {
    signal?.throwIfAborted();
    const text = await readText(file);
    if (text === void 0) {
      continue;
    }
    if (CONFIG_FILE.test(import_node_path5.posix.basename(file))) {
      configSources.push({ source: file, text });
    }
    const { imports, dynamicPrefixes } = extractImports(text);
    for (const { specifier, kind } of imports) {
      const resolution = resolver.resolve(file, specifier);
      if (resolution.kind === "file") {
        addEdge(`file:${file}`, `file:${resolution.path}`, kind);
      } else if (resolution.kind === "package") {
        addEdge(`file:${file}`, `package:${resolution.name}`, kind);
        const importers = packageImporters.get(resolution.name) ?? /* @__PURE__ */ new Set();
        importers.add(file);
        packageImporters.set(resolution.name, importers);
      } else if (resolution.kind === "unresolved") {
        unresolved.push({ file, specifier });
      }
    }
    for (const prefix of dynamicPrefixes) {
      if (prefix === "") {
        fullyComputed.push(file);
        continue;
      }
      if (!prefix.startsWith(".")) {
        continue;
      }
      const base = import_node_path5.posix.normalize(import_node_path5.posix.join(import_node_path5.posix.dirname(file), prefix)).replace(/^\.\//, "");
      for (const candidate of sourceFiles) {
        if (candidate.startsWith(base) && candidate !== file) {
          addEdge(`file:${file}`, `file:${candidate}`, "maybe");
        }
      }
    }
  }
  for (const file of allFiles.filter((f) => CONFIG_FILE.test(import_node_path5.posix.basename(f)) && !SOURCE_FILE.test(f))) {
    const text = await readText(file);
    if (text !== void 0) {
      configSources.push({ source: file, text });
    }
  }
  const followPathLiterals = (source, text) => {
    const dir = import_node_path5.posix.dirname(source) === "." ? "" : import_node_path5.posix.dirname(source);
    const workspace = workspaceOf2(source, workspaceDirs);
    for (const match of text.matchAll(PATH_LITERAL)) {
      const hit = resolver.resolvePath(import_node_path5.posix.join(dir, match[1])) ?? resolver.resolvePath(import_node_path5.posix.join(workspace, match[1]));
      if (hit?.kind === "file" && SOURCE_FILE.test(hit.path)) {
        addEdge(`file:${source}`, `file:${hit.path}`, "config");
      }
    }
  };
  for (const { source, text } of configSources) {
    followPathLiterals(source, text);
  }
  const entries = /* @__PURE__ */ new Map();
  const addEntry = (path, reason) => {
    if (fileSet.has(path) && !entries.has(path)) {
      entries.set(path, reason);
    }
  };
  const scriptSources = [];
  const frameworks = /* @__PURE__ */ new Map();
  for (const [dir, manifest] of manifests) {
    const manifestPath = import_node_path5.posix.join(dir, "package.json");
    for (const entry of manifestEntryPaths(manifest)) {
      const hit = resolver.resolvePath(import_node_path5.posix.join(dir, entry));
      if (hit?.kind === "file") {
        addEntry(hit.path, `Entry point in ${manifestPath}`);
        continue;
      }
      const built = import_node_path5.posix.normalize(entry).match(BUILD_OUTPUT);
      if (built) {
        const source = resolver.resolvePath(import_node_path5.posix.join(dir, "src", built[1].replace(/\.[cm]?js$/, "")));
        if (source?.kind === "file") {
          addEntry(source.path, `Source of ${entry}, the entry point in ${manifestPath}`);
        }
      }
    }
    const scripts = manifest.scripts && typeof manifest.scripts === "object" ? Object.values(manifest.scripts).filter((s) => typeof s === "string").join("\n") : "";
    if (scripts) {
      scriptSources.push({ source: manifestPath, text: scripts });
      for (const match of scripts.matchAll(COMMAND_PATH)) {
        const hit = resolver.resolvePath(import_node_path5.posix.join(dir, match[1]));
        if (hit?.kind === "file") {
          addEntry(hit.path, `Run by a script in ${manifestPath}`);
        }
      }
    }
    const dependencies = dependencyNames(manifest, ["dependencies", "devDependencies", "peerDependencies"]);
    for (const [dependency, pattern, framework] of FRAMEWORK_ENTRIES) {
      const frameworkPackage = dependencies.find((name) => dependency.test(name));
      if (!frameworkPackage) {
        continue;
      }
      frameworks.set(frameworkPackage, framework);
      for (const file of sourceFiles) {
        if (workspaceOf2(file, workspaceDirs) === dir && pattern.test(relativeTo(dir, file))) {
          addEntry(file, `${framework} loads this file by convention`);
        }
      }
    }
  }
  const ciSources = [];
  for (const file of allFiles.filter((f) => CI_FILE.test(f))) {
    const text = await readText(file);
    if (text === void 0) {
      continue;
    }
    ciSources.push({ source: file, text });
    for (const match of text.matchAll(COMMAND_PATH)) {
      const hit = resolver.resolvePath(match[1]);
      if (hit?.kind === "file") {
        addEntry(hit.path, `Run from ${file}`);
      }
    }
  }
  for (const file of allFiles.filter((f) => f.endsWith(".html"))) {
    const text = await readText(file);
    const dir = import_node_path5.posix.dirname(file) === "." ? "" : import_node_path5.posix.dirname(file);
    for (const match of text?.matchAll(HTML_SCRIPT) ?? []) {
      const src = match[1];
      const hit = resolver.resolvePath(src.startsWith("/") ? import_node_path5.posix.join(workspaceOf2(file, workspaceDirs), src) : import_node_path5.posix.join(dir, src));
      if (hit?.kind === "file") {
        addEntry(hit.path, `Loaded by <script> in ${file}`);
      }
    }
  }
  const isUserEntry = createMatcher(options.entryPoints ?? []);
  for (const file of sourceFiles) {
    const dir = workspaceOf2(file, workspaceDirs);
    const name = import_node_path5.posix.basename(file);
    if (isUserEntry(file)) {
      addEntry(file, "Listed in the deadweight.entryPoints setting");
    } else if (CONFIG_FILE.test(name) || name.startsWith(".")) {
      addEntry(file, "Config file, loaded by its tool");
    } else if (DECLARATION_FILE.test(file)) {
      addEntry(file, "Type declarations, used by TypeScript without an import");
    } else if (TEST_FILE.test(file)) {
      addEntry(file, "Test or story file, loaded by its runner");
    } else if (DEFAULT_ENTRY.test(relativeTo(dir, file))) {
      addEntry(file, "Default entry file");
    }
  }
  for (const [path, reason] of entries) {
    if (reason.startsWith("Run ") && SOURCE_FILE.test(path) && !CONFIG_FILE.test(import_node_path5.posix.basename(path))) {
      const text = await readText(path);
      if (text !== void 0) {
        followPathLiterals(path, text);
      }
    }
  }
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) {
      outgoing.set(edge.from, []);
    }
    if (!incoming.has(edge.to)) {
      incoming.set(edge.to, []);
    }
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }
  const walk = (starts, followMaybe, seen) => {
    const queue = [...starts];
    queue.forEach((id) => seen.add(id));
    for (let next = 0; next < queue.length; next++) {
      const id = queue[next];
      for (const edge of outgoing.get(id) ?? []) {
        if ((followMaybe || edge.kind !== "maybe") && edge.to.startsWith("file:") && !seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  };
  const used = /* @__PURE__ */ new Set();
  walk([...entries.keys()].map((path) => `file:${path}`), false, used);
  const maybe = new Set(used);
  walk([...used], true, maybe);
  for (const id of used) {
    maybe.delete(id);
  }
  const isAppCode = (file) => used.has(`file:${file}`) && !TEST_FILE.test(file) && !CONFIG_FILE.test(import_node_path5.posix.basename(file));
  const usedFullyComputed = [...new Set(fullyComputed.filter(isAppCode))];
  const unresolvedInUse = unresolved.filter(({ file }) => isAppCode(file));
  const nodes = [];
  const fileNodes = /* @__PURE__ */ new Set([
    ...sourceFiles.map((file) => `file:${file}`),
    ...edges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id.startsWith("file:"))
  ]);
  const importersOf = (id, among) => (incoming.get(id) ?? []).map((edge) => edge.from).filter((from) => from.startsWith("file:") && (!among || among.has(from))).map((from) => from.slice("file:".length));
  for (const id of fileNodes) {
    const path = id.slice("file:".length);
    const workspace = workspaceOf2(path, workspaceDirs);
    let status;
    let reason;
    if (entries.has(path)) {
      status = "entry";
      reason = entries.get(path);
    } else if (used.has(id)) {
      status = "used";
      reason = `Imported by ${list(importersOf(id, used))}`;
    } else if (maybe.has(id)) {
      status = "maybe";
      const loaders = (incoming.get(id) ?? []).filter((edge) => edge.kind === "maybe").map((edge) => edge.from.slice(5));
      reason = loaders.length > 0 ? `May be loaded by a computed import in ${list(loaders)}` : `Only reachable through files that are loaded by a computed import`;
    } else if (usedFullyComputed.length > 0) {
      status = "maybe";
      reason = `Nothing imports this file, but ${list(usedFullyComputed)} loads a computed path that could be anything`;
    } else if (unresolvedInUse.length > 0 && unresolvedInUse.some((u) => workspaceOf2(u.file, workspaceDirs) === workspace)) {
      const example = unresolvedInUse.find((u) => workspaceOf2(u.file, workspaceDirs) === workspace);
      status = "maybe";
      reason = `Nothing imports this file, but some imports couldn't be resolved (e.g. "${example.specifier}" in ${example.file})`;
    } else {
      status = "unused";
      const deadImporters = importersOf(id);
      reason = deadImporters.length > 0 ? `Only imported by unused files: ${list(deadImporters)}` : "Nothing imports this file";
    }
    nodes.push({ id, kind: "file", label: import_node_path5.posix.basename(path), path, workspace, status, reason });
  }
  const declared = /* @__PURE__ */ new Map();
  for (const [dir, manifest] of manifests) {
    for (const name of dependencyNames(manifest, ["dependencies", "devDependencies", "optionalDependencies"])) {
      if (!workspacePackages.has(name)) {
        declared.set(name, [...declared.get(name) ?? [], import_node_path5.posix.join(dir, "package.json")]);
      }
    }
  }
  const statusOf = new Map(nodes.map((node) => [node.id, node.status]));
  const isLive = (file) => ["entry", "used"].includes(statusOf.get(`file:${file}`) ?? "");
  const liveJsx = sourceFiles.some((file) => /\.[jt]sx$/.test(file) && isLive(file));
  const configNames = new Set(configSources.map(({ source }) => import_node_path5.posix.basename(source)));
  const peerOf = /* @__PURE__ */ new Map();
  for (const [name, importers] of packageImporters) {
    if (![...importers].some(isLive)) {
      continue;
    }
    const workspace = workspaceOf2([...importers][0], workspaceDirs);
    const installed = await readInstalledPackage(root, workspace, name);
    for (const peer of installed?.peers ?? []) {
      if (!peerOf.has(peer)) {
        peerOf.set(peer, name);
      }
    }
  }
  for (const name of /* @__PURE__ */ new Set([...declared.keys(), ...packageImporters.keys()])) {
    const importers = [...packageImporters.get(name) ?? []];
    const liveImporters = importers.filter(isLive);
    const maybeImporters = importers.filter((file) => statusOf.get(`file:${file}`) === "maybe");
    const manifestsDeclaring = declared.get(name) ?? [];
    const workspace = manifestsDeclaring.length > 0 ? workspaceOf2(manifestsDeclaring[0], workspaceDirs) : workspaceOf2(importers[0] ?? "", workspaceDirs);
    let status;
    let reason;
    const toolConfig = TOOL_CONFIG_FILES.find(([tool, pattern]) => tool === name && [...configNames].some((file) => pattern.test(file)));
    const runBy = [...scriptSources, ...ciSources].find(({ text }) => mentions(text, name));
    const mention = configSources.find(({ text }) => mentions(text, name));
    if (liveImporters.length > 0) {
      status = "used";
      reason = manifestsDeclaring.length > 0 || HOST_PROVIDED.has(name) ? `Imported by ${list(liveImporters)}` : `Imported by ${list(liveImporters)}, but not declared in any package.json`;
    } else if (runBy) {
      status = "used";
      reason = runBy.source.endsWith("package.json") ? `Run by a script in ${runBy.source}` : `Run from ${runBy.source}`;
    } else if (frameworks.has(name)) {
      status = "used";
      reason = `The ${frameworks.get(name)} framework; it runs the app and loads its files`;
    } else if (peerOf.has(name)) {
      status = "used";
      reason = `Peer dependency of ${peerOf.get(name)}, which loads it`;
    } else if (liveJsx && JSX_RUNTIMES.includes(name)) {
      status = "used";
      reason = "JSX runtime, used by .jsx/.tsx files without an import";
    } else if (maybeImporters.length > 0) {
      status = "maybe";
      reason = `Only imported by files that may be unused: ${list(maybeImporters)}`;
    } else if (toolConfig) {
      status = "maybe";
      reason = `A ${name} config file exists, so a tool or editor probably runs it`;
    } else if (mention) {
      status = "maybe";
      reason = `Not imported, but referenced by name in ${mention.source}`;
    } else if (name.startsWith("@types/")) {
      status = "maybe";
      reason = "Type definitions; TypeScript uses them without an import";
    } else if (PLUGIN_PACKAGE.some((pattern) => pattern.test(name))) {
      status = "maybe";
      reason = "Looks like a plugin or preset, which tools load by name";
    } else if (importers.length > 0) {
      status = "unused";
      reason = `Only imported by unused files: ${list(importers)}`;
    } else {
      status = "unused";
      reason = `Declared in ${list(manifestsDeclaring)}, but nothing imports it`;
    }
    nodes.push({ id: `package:${name}`, kind: "package", label: name, workspace, status, reason });
  }
  const count2 = (kind, status) => nodes.filter((node) => node.kind === kind && node.status === status).length;
  return {
    nodes,
    edges,
    unresolved,
    stats: {
      files: nodes.filter((node) => node.kind === "file").length,
      entries: count2("file", "entry"),
      used: count2("file", "used"),
      maybe: count2("file", "maybe"),
      unused: count2("file", "unused"),
      packages: nodes.filter((node) => node.kind === "package").length,
      unusedPackages: count2("package", "unused")
    },
    durationMs: Date.now() - startedAt
  };
}

// src/engine/knip.ts
var import_node_fs = require("node:fs");
var import_promises3 = require("node:fs/promises");
var import_node_path6 = require("node:path");
var KNIP_ARGS = ["--yes", "knip@6", "--reporter", "json"];
var KNIP_ENV = { KNIP_DISABLE_RAW_TRANSFER: "1" };
var KNIP_CONFIG_FILES = [
  "knip.json",
  "knip.jsonc",
  ".knip.json",
  ".knip.jsonc",
  "knip.ts",
  "knip.js",
  "knip.config.ts",
  "knip.config.js"
];
var KNIP_DEFAULT_EXTENSIONS = "js,mjs,cjs,jsx,ts,tsx,mts,cts";
var KNIP_DEFAULT_ENTRY = [
  `{index,cli,main}.{${KNIP_DEFAULT_EXTENSIONS}}!`,
  `src/{index,cli,main}.{${KNIP_DEFAULT_EXTENSIONS}}!`
];
var GENERATED_KNIP_CONFIG = "node_modules/.cache/deadweight/knip.json";
function findProjectKnipConfig(workspaceRoot) {
  const file = KNIP_CONFIG_FILES.find((name) => (0, import_node_fs.existsSync)((0, import_node_path6.join)(workspaceRoot, name)));
  if (file) {
    return file;
  }
  try {
    const manifest = JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path6.join)(workspaceRoot, "package.json"), "utf8"));
    return manifest.knip ? "package.json#knip" : void 0;
  } catch {
    return void 0;
  }
}
function workspaceForGlob(workspaceRoot, glob) {
  const segments = glob.split("/");
  const staticSegments = segments.slice(0, -1);
  const firstDynamic = staticSegments.findIndex((segment) => /[*?{}[\]!]/.test(segment));
  if (firstDynamic !== -1) {
    staticSegments.length = firstDynamic;
  }
  for (let depth = staticSegments.length; depth > 0; depth--) {
    const dir = staticSegments.slice(0, depth).join("/");
    if ((0, import_node_fs.existsSync)((0, import_node_path6.join)(workspaceRoot, dir, "package.json"))) {
      return { workspace: dir, pattern: segments.slice(depth).join("/") };
    }
  }
  return { workspace: ".", pattern: glob };
}
function planKnipConfig(workspaceRoot, entryPoints = []) {
  const globs = entryPoints.map((glob) => glob.trim().replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
  if (globs.length === 0) {
    return { args: [], warnings: [] };
  }
  const existing = findProjectKnipConfig(workspaceRoot);
  if (existing) {
    return {
      args: [],
      warnings: [
        `The deadweight.entryPoints setting was not passed to knip because this project has its own knip config (${existing}). Add the entry points to its "entry" list instead.`
      ]
    };
  }
  const workspaces = {};
  for (const glob of globs) {
    const { workspace, pattern } = workspaceForGlob(workspaceRoot, glob);
    workspaces[workspace] ??= { entry: [...KNIP_DEFAULT_ENTRY] };
    workspaces[workspace].entry.push(pattern);
  }
  return {
    // Hints would point at the generated file, which the user never sees.
    args: ["--config", GENERATED_KNIP_CONFIG, "--no-config-hints"],
    config: { workspaces },
    warnings: []
  };
}
async function withKnipConfig(workspaceRoot, entryPoints, task) {
  const plan = planKnipConfig(workspaceRoot, entryPoints);
  if (!plan.config) {
    return { result: await task(plan.args), warnings: plan.warnings };
  }
  const configPath = (0, import_node_path6.join)(workspaceRoot, GENERATED_KNIP_CONFIG);
  await (0, import_promises3.mkdir)((0, import_node_path6.dirname)(configPath), { recursive: true });
  await (0, import_promises3.writeFile)(configPath, JSON.stringify(plan.config, null, 2));
  try {
    return { result: await task(plan.args), warnings: plan.warnings };
  } finally {
    await (0, import_promises3.rm)(configPath, { force: true });
  }
}
function parseKnipOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Knip returned invalid JSON output.");
  }
  const issues = parsed?.issues;
  if (!Array.isArray(issues)) {
    throw new Error(
      "Knip returned an unexpected JSON format. The knip version in use may be unsupported."
    );
  }
  const findings = [];
  const unresolvedFiles = [];
  for (const row of issues) {
    if (row.unresolved?.length) {
      unresolvedFiles.push(row.file);
    }
    if (row.files?.length) {
      findings.push({
        id: `file:${row.file}`,
        kind: "file",
        name: row.file,
        confidence: "medium",
        score: 0,
        reason: "Knip reported this file as unused."
      });
    }
    const exportIssues = [
      ...(row.exports ?? []).map((item) => ({ item, type: false })),
      ...(row.types ?? []).map((item) => ({ item, type: true }))
    ];
    for (const { item, type } of exportIssues) {
      findings.push({
        id: `export:${row.file}:${item.name}`,
        kind: "export",
        name: item.name,
        confidence: "medium",
        score: 0,
        reason: type ? "Knip reported this exported type as unused." : "Knip reported this export as unused.",
        file: row.file,
        line: item.line,
        column: item.col
      });
    }
    const workspaceDir = import_node_path6.posix.dirname(row.file);
    const workspace = workspaceDir === "." ? void 0 : workspaceDir;
    const packageIssues = [
      ...(row.dependencies ?? []).map((item) => ({ item, dev: false })),
      ...(row.devDependencies ?? []).map((item) => ({ item, dev: true }))
    ];
    for (const { item, dev } of packageIssues) {
      findings.push({
        id: `package:${row.file}:${item.name}`,
        kind: "package",
        name: item.name,
        confidence: "medium",
        score: 0,
        reason: dev ? "Knip reported this development dependency as unused." : "Knip reported this package as unused.",
        workspace
      });
    }
  }
  return { findings, unresolvedFiles };
}
async function runKnip(workspaceRoot, { signal, entryPoints } = {}) {
  const { result, warnings } = await withKnipConfig(
    workspaceRoot,
    entryPoints,
    (args) => runProcess("npx", [...KNIP_ARGS, ...args], {
      cwd: workspaceRoot,
      signal,
      env: KNIP_ENV
    })
  );
  const { code, stdout, stderr } = result;
  if (code !== 0 && code !== 1 || !stdout.trim()) {
    throw new Error(
      stderr.trim() || `Knip exited with code ${code ?? "unknown"}.`
    );
  }
  return {
    ...parseKnipOutput(stdout),
    warnings: [...warnings, ...stderr.trim() ? [stderr.trim()] : []]
  };
}

// src/engine/packageManager.ts
var import_node_fs2 = require("node:fs");
var import_node_path7 = require("node:path");
var PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"];
function fromPackageJsonField(workspaceRoot) {
  try {
    const manifest = JSON.parse(
      (0, import_node_fs2.readFileSync)((0, import_node_path7.join)(workspaceRoot, "package.json"), "utf8")
    );
    if (typeof manifest.packageManager !== "string") {
      return void 0;
    }
    const name = manifest.packageManager.split("@")[0];
    return PACKAGE_MANAGERS.find((manager) => manager === name);
  } catch {
    return void 0;
  }
}
function detectPackageManager(workspaceRoot) {
  const declared = fromPackageJsonField(workspaceRoot);
  if (declared) {
    return declared;
  }
  if ((0, import_node_fs2.existsSync)((0, import_node_path7.join)(workspaceRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if ((0, import_node_fs2.existsSync)((0, import_node_path7.join)(workspaceRoot, "yarn.lock"))) {
    return "yarn";
  }
  if ((0, import_node_fs2.existsSync)((0, import_node_path7.join)(workspaceRoot, "bun.lock")) || (0, import_node_fs2.existsSync)((0, import_node_path7.join)(workspaceRoot, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

// src/engine/scan.ts
async function readPackageInfo(workspaceRoot, findings) {
  const info = /* @__PURE__ */ new Map();
  const peerOwners = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    if (finding.kind !== "package") {
      continue;
    }
    const workspace = finding.workspace ?? "";
    if (!peerOwners.has(workspace)) {
      const owners = /* @__PURE__ */ new Map();
      const declared = await readDeclaredDependencies(workspaceRoot, (0, import_node_path8.join)(workspace, "package.json"));
      for (const dependency of declared) {
        const installed2 = await readInstalledPackage(workspaceRoot, workspace, dependency);
        for (const peer of installed2?.peers ?? []) {
          if (!owners.has(peer)) {
            owners.set(peer, dependency);
          }
        }
      }
      peerOwners.set(workspace, owners);
    }
    const installed = await readInstalledPackage(workspaceRoot, workspace, finding.name);
    info.set(finding.id, {
      bins: installed?.bins ?? [],
      peerOf: peerOwners.get(workspace)?.get(finding.name)
    });
  }
  return info;
}
async function addFootprints(workspaceRoot, manifestDirs, findings, { signal, fetchAdvisories, warnings }) {
  const removals = findings.filter((finding) => finding.kind === "package").map((finding) => ({ id: finding.id, manifestDir: finding.workspace ?? "", name: finding.name }));
  if (removals.length === 0) {
    return { findings };
  }
  try {
    const result = await measureFootprints(workspaceRoot, manifestDirs, removals, { signal, fetchAdvisories });
    warnings.push(...result.warnings);
    return {
      findings: findings.map((finding) => {
        const footprint = result.perRemoval.get(finding.id);
        return footprint ? { ...finding, footprint, sizeBytes: footprint.bytes } : finding;
      }),
      footprint: result.combined
    };
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    warnings.push(`Couldn't measure what the unused packages take up: ${error.message}`);
    return { findings };
  }
}
var defaultEngines = { runKnip, runDepcheck };
function rebaseGlobs(globs, project) {
  if (!project) {
    return globs;
  }
  return globs.flatMap((glob) => {
    const cleaned = glob.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (cleaned.startsWith(`${project}/`)) {
      return [cleaned.slice(project.length + 1)];
    }
    const body = cleaned.replace(/^!/, "");
    const anywhere = body.startsWith("**/") || !body.replace(/\/$/, "").includes("/") || body.startsWith("@");
    return anywhere ? [cleaned] : [];
  });
}
function prefixFinding(finding, project) {
  if (!project) {
    return finding;
  }
  const inProject = (path) => import_node_path8.posix.join(project, path);
  switch (finding.kind) {
    case "file":
      return { ...finding, id: `file:${inProject(finding.name)}`, name: inProject(finding.name) };
    case "export": {
      const file = inProject(finding.file ?? "");
      return { ...finding, id: `export:${file}:${finding.name}`, file };
    }
    case "package": {
      const workspace = inProject(finding.workspace ?? "");
      return { ...finding, id: `package:${import_node_path8.posix.join(workspace, "package.json")}:${finding.name}`, workspace };
    }
  }
}
async function scanFolder(folder, options = {}) {
  const { signal, onProject, exclude = [], entryPoints = [] } = options;
  const startedAt = Date.now();
  const projects = options.projects ?? await findProjectRoots(folder, signal);
  if (projects.length === 0) {
    throw new Error(
      `No package.json found in ${folder} or its subfolders. Deadweight scans JavaScript/TypeScript projects.`
    );
  }
  const findings = [];
  const warnings = [];
  const packageManagers = {};
  let scannedFileCount = 0;
  let footprint;
  for (const [index, project] of projects.entries()) {
    onProject?.(project, index, projects.length);
    const result = await scanWorkspace((0, import_node_path8.join)(folder, project), {
      ...options,
      exclude: rebaseGlobs(exclude, project),
      entryPoints: rebaseGlobs(entryPoints, project)
    });
    findings.push(...result.findings.map((finding) => prefixFinding(finding, project)));
    warnings.push(...result.warnings.map((warning) => project ? `[${project}] ${warning}` : warning));
    packageManagers[project] = result.packageManager;
    scannedFileCount += result.scannedFileCount;
    if (result.footprint) {
      footprint = {
        packages: (footprint?.packages ?? 0) + result.footprint.packages,
        bytes: (footprint?.bytes ?? 0) + result.footprint.bytes,
        advisories: [...footprint?.advisories ?? [], ...result.footprint.advisories]
      };
    }
  }
  return {
    findings,
    scannedFileCount,
    packageManager: packageManagers[projects[0]],
    durationMs: Date.now() - startedAt,
    warnings,
    projects,
    footprint
  };
}
async function scanWorkspace(workspaceRoot, {
  signal,
  engines = defaultEngines,
  exclude = [],
  entryPoints = [],
  packageManager,
  fetchAdvisories
} = {}) {
  if (!(0, import_node_fs3.existsSync)((0, import_node_path8.join)(workspaceRoot, "package.json"))) {
    throw new Error(
      `No package.json found in ${workspaceRoot}. Deadweight scans JavaScript/TypeScript projects. Open the folder that contains package.json.`
    );
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const stopOthersOnFailure = (task) => task.catch((error) => {
    controller.abort();
    throw error;
  });
  const depcheckTask = engines.runDepcheck(workspaceRoot, controller.signal).catch(
    (error) => {
      if (error instanceof CancelledError) {
        throw error;
      }
      return error instanceof Error ? error : new Error(String(error));
    }
  );
  const graphTask = buildConnectionGraph(workspaceRoot, { signal: controller.signal, entryPoints }).catch(
    (error) => {
      if (error instanceof CancelledError || controller.signal.aborted) {
        throw new CancelledError("Scan cancelled.");
      }
      return error instanceof Error ? error : new Error(String(error));
    }
  );
  try {
    const [knip, depcheck, context, graph] = await Promise.all([
      stopOthersOnFailure(engines.runKnip(workspaceRoot, { signal: controller.signal, entryPoints })),
      stopOthersOnFailure(depcheckTask),
      stopOthersOnFailure(collectProjectContext(workspaceRoot, controller.signal)),
      stopOthersOnFailure(graphTask)
    ]);
    const warnings = [...knip.warnings];
    let depcheckUnused;
    if (depcheck instanceof Error) {
      warnings.push(
        `depcheck couldn't run, so package confidence is capped at medium: ${depcheck.message}`
      );
    } else {
      depcheckUnused = depcheck.unused;
      warnings.push(...depcheck.warnings);
    }
    if (graph instanceof Error) {
      warnings.push(`Deadweight's connection graph couldn't be built, so scores rely on knip alone: ${graph.message}`);
    }
    const findings = filterFindings(knip.findings, { exclude, entryPoints });
    const packageInfo = await readPackageInfo(workspaceRoot, findings);
    const scored = scoreFindings(findings, {
      context,
      unresolvedFiles: knip.unresolvedFiles,
      depcheckUnused,
      packageInfo,
      graph: graph instanceof Error ? void 0 : new Map(graph.nodes.map((node) => [node.id, node]))
    });
    const { findings: measured, footprint } = await addFootprints(
      workspaceRoot,
      context.workspaceDirs,
      scored,
      { signal: controller.signal, fetchAdvisories, warnings }
    );
    return {
      findings: measured,
      scannedFileCount: context.sourceFileCount,
      packageManager: packageManager ?? detectPackageManager(workspaceRoot),
      durationMs: Date.now() - startedAt,
      warnings,
      footprint
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new CancelledError("Scan cancelled.");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

// src/action/report.ts
var COMMENT_MARKER = "<!-- deadweight-pr-guard -->";
function diffFindings(base, head) {
  const baseIds = new Set(base.map((finding) => finding.id));
  const headIds = new Set(head.map((finding) => finding.id));
  return {
    added: head.filter((finding) => !baseIds.has(finding.id)),
    removed: base.filter((finding) => !headIds.has(finding.id)),
    existing: head.filter((finding) => baseIds.has(finding.id))
  };
}
function shouldFail(diff, failOn) {
  return failOn === "new" ? diff.added.length > 0 : failOn === "new-high" ? diff.added.some((finding) => finding.confidence === "high") : false;
}
var KIND = {
  file: { icon: "\u{1F4C4}", one: "unused file", many: "unused files" },
  package: { icon: "\u{1F4E6}", one: "unused package", many: "unused packages" },
  export: { icon: "\u{1F523}", one: "unused export", many: "unused exports" }
};
var KIND_ORDER = ["package", "file", "export"];
function count(findings, kind) {
  const n = findings.filter((finding) => finding.kind === kind).length;
  return `${n} ${n === 1 ? KIND[kind].one : KIND[kind].many}`;
}
function summarize(findings) {
  const parts = KIND_ORDER.filter((kind) => findings.some((finding) => finding.kind === kind)).map((kind) => count(findings, kind));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
function cell(text, max = 160) {
  const flat = text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}
function itemLabel(finding) {
  if (finding.kind === "export") {
    return `\`${finding.name}\` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\``;
  }
  return finding.kind === "package" && finding.workspace ? `\`${finding.name}\` (${finding.workspace})` : `\`${finding.name}\``;
}
function gainLabel(finding) {
  const footprint = finding.footprint;
  if (!footprint || footprint.packages === 0) {
    return "";
  }
  const vulnerabilities = footprint.advisories.length > 0 ? ` \xB7 \u26A0\uFE0F ${describeAdvisories(footprint.advisories)}` : "";
  return ` \xB7 ${formatBytes(footprint.bytes)}${vulnerabilities}`;
}
function table(findings) {
  const rows = [...findings].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.score - a.score).map((finding) => `| ${KIND[finding.kind].icon} | ${itemLabel(finding)} | ${finding.score} ${finding.confidence} | ${cell(finding.reason)}${gainLabel(finding)} |`);
  return ["| | Unused | Score | Why |", "|---|---|---|---|", ...rows].join("\n");
}
function renderReport(diff, { compared, runUrl }) {
  const lines = [COMMENT_MARKER, "### \u{1F480} Deadweight", ""];
  if (!compared) {
    lines.push(
      diff.added.length > 0 ? `**This project has ${summarize(diff.added)}.**` : "\u2705 **No unused packages, files or exports found.**"
    );
  } else if (diff.added.length > 0) {
    lines.push(`**This pull request adds ${summarize(diff.added)}.**`);
  } else {
    lines.push("\u2705 **This pull request adds no unused code.**");
  }
  if (diff.added.length > 0) {
    const vulnerable = diff.added.flatMap((finding) => finding.footprint?.advisories ?? []);
    if (vulnerable.length > 0) {
      lines.push("", `> [!WARNING]
> The unused packages carry ${describeAdvisories(vulnerable)}. Removing them removes the risk.`);
    }
    lines.push("", table(diff.added));
  }
  if (diff.removed.length > 0) {
    lines.push("", `\u{1F389} It also removes ${summarize(diff.removed)} that ${diff.removed.length === 1 ? "was" : "were"} already there.`);
  }
  if (compared && diff.existing.length > 0) {
    lines.push(
      "",
      `<details><summary>${summarize(diff.existing)} already on the base branch</summary>`,
      "",
      table(diff.existing),
      "",
      "</details>"
    );
  }
  lines.push(
    "",
    `<sub>Score = how safe it is to delete (0\u2013100). Clean up safely with the [Deadweight VS Code extension](https://marketplace.visualstudio.com/items?itemName=kalyanmanna.deadweight): every removal is verified with your build and tests, and undoable.${runUrl ? ` \xB7 [Run details](${runUrl})` : ""}</sub>`
  );
  return `${lines.join("\n")}
`;
}
function annotation(level, message, { file, line, title }) {
  const escapeData = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escapeProperty = (text) => escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
  const properties = [
    ...file ? [`file=${escapeProperty(file)}`] : [],
    ...line ? [`line=${line}`] : [],
    ...title ? [`title=${escapeProperty(title)}`] : []
  ];
  return `::${level}${properties.length > 0 ? ` ${properties.join(",")}` : ""}::${escapeData(message)}`;
}

// src/action/main.ts
function input(env, name, fallback = "") {
  return (env[`INPUT_${name.toUpperCase()}`] ?? "").trim() || fallback;
}
function listInput(env, name) {
  return input(env, name).split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}
async function checkoutBaseWithGit(repoDir, sha) {
  const git = (args) => runProcess("git", args, { cwd: repoDir });
  if ((await git(["cat-file", "-e", `${sha}^{commit}`])).code !== 0) {
    const fetched = await git(["fetch", "--no-tags", "--depth=1", "origin", sha]);
    if (fetched.code !== 0) {
      throw new Error(`Couldn't fetch the base commit ${sha}: ${fetched.stderr.trim()}`);
    }
  }
  const dir = (0, import_node_path9.join)((0, import_node_fs4.mkdtempSync)((0, import_node_path9.join)((0, import_node_os.tmpdir)(), "deadweight-base-")), "repo");
  const added = await git(["worktree", "add", "--detach", dir, sha]);
  if (added.code !== 0) {
    throw new Error(`Couldn't check out the base commit ${sha}: ${added.stderr.trim()}`);
  }
  return {
    dir,
    cleanup: async () => {
      await git(["worktree", "remove", "--force", dir]);
    }
  };
}
async function upsertComment({ env, fetch: fetchImpl = fetch }, token, prNumber, body, onlyIfExists) {
  const api = env.GITHUB_API_URL ?? "https://api.github.com";
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY is not set.");
  }
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "deadweight-pr-guard",
    "content-type": "application/json"
  };
  const call = async (method, path, payload) => {
    const response = await fetchImpl(`${api}${path}`, { method, headers, body: payload ? JSON.stringify(payload) : void 0 });
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return response.json();
  };
  let existing;
  for (let page = 1; page <= 10 && !existing; page++) {
    const comments = await call("GET", `/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`);
    existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
    if (comments.length < 100) {
      break;
    }
  }
  if (existing) {
    await call("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, { body });
    return "updated";
  }
  if (onlyIfExists) {
    return "skipped";
  }
  await call("POST", `/repos/${repo}/issues/${prNumber}/comments`, { body });
  return "created";
}
function locate(finding, projectDir, repoPrefix) {
  const inRepo = (path) => repoPrefix ? import_node_path9.posix.join(repoPrefix, path) : path;
  if (finding.kind === "export") {
    return { file: inRepo(finding.file ?? ""), line: finding.line };
  }
  if (finding.kind === "file") {
    return { file: inRepo(finding.name), line: 1 };
  }
  const manifest = import_node_path9.posix.join(finding.workspace ?? "", "package.json");
  let line;
  try {
    const index = (0, import_node_fs4.readFileSync)((0, import_node_path9.join)(projectDir, manifest), "utf8").split(/\r?\n/).findIndex((text) => text.includes(JSON.stringify(finding.name)));
    line = index >= 0 ? index + 1 : void 0;
  } catch {
  }
  return { file: inRepo(manifest), line };
}
async function run(options) {
  const { env, engines, fetchAdvisories } = options;
  const write = options.write ?? ((line) => process.stdout.write(`${line}
`));
  const repoDir = (0, import_node_path9.resolve)(env.GITHUB_WORKSPACE ?? process.cwd());
  const relativePath = input(env, "path", ".").replace(/\\/g, "/").replace(/^\.\/?/, "").replace(/\/$/, "");
  const projectDir = relativePath ? (0, import_node_path9.join)(repoDir, relativePath) : repoDir;
  const failOnInput = input(env, "fail-on", "none");
  const failOn = failOnInput === "new" || failOnInput === "new-high" ? failOnInput : "none";
  const scanOptions = {
    engines,
    exclude: listInput(env, "exclude"),
    entryPoints: listInput(env, "entry-points")
  };
  const event = env.GITHUB_EVENT_PATH ? JSON.parse((0, import_node_fs4.readFileSync)(env.GITHUB_EVENT_PATH, "utf8")) : {};
  const pullRequest = event.pull_request;
  const scan = async (dir, label, advisories) => {
    write(`::group::Scanning ${label}`);
    try {
      return await scanFolder(dir, {
        ...scanOptions,
        fetchAdvisories: advisories,
        onProject: (project, index, total) => write(`Project ${index + 1}/${total}: ${project || "."}`)
      });
    } finally {
      write("::endgroup::");
    }
  };
  const vulnerabilityLookup = input(env, "check-vulnerabilities", "true") === "false" ? false : fetchAdvisories;
  const head = await scan(projectDir, pullRequest ? "the pull request" : "the project", vulnerabilityLookup);
  let diff = { added: head.findings, removed: [], existing: [] };
  let compared = false;
  if (pullRequest) {
    const checkout = options.checkoutBase ?? checkoutBaseWithGit;
    try {
      const base = await checkout(repoDir, pullRequest.base.sha);
      try {
        const baseResult = await scan(relativePath ? (0, import_node_path9.join)(base.dir, relativePath) : base.dir, "the base branch", false);
        diff = diffFindings(baseResult.findings, head.findings);
        compared = true;
      } finally {
        await base.cleanup();
      }
    } catch (error) {
      write(annotation("warning", `Couldn't scan the base branch, so every unused item is reported, not only new ones: ${error.message}`, { title: "Deadweight" }));
    }
  }
  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : void 0;
  const report = renderReport(diff, { compared, runUrl });
  for (const finding of diff.added) {
    const location = locate(finding, projectDir, relativePath);
    const what = finding.kind === "package" ? `Unused package ${finding.name}` : finding.kind === "export" ? `Unused export ${finding.name}` : "Unused file";
    write(annotation(finding.confidence === "high" ? "warning" : "notice", `${finding.reason} (safe-to-delete score ${finding.score})`, { ...location, title: `Deadweight: ${what}` }));
  }
  if (env.GITHUB_STEP_SUMMARY) {
    (0, import_node_fs4.appendFileSync)(env.GITHUB_STEP_SUMMARY, report.replace(COMMENT_MARKER, ""));
  }
  if (env.GITHUB_OUTPUT) {
    (0, import_node_fs4.appendFileSync)(env.GITHUB_OUTPUT, [
      `added=${diff.added.length}`,
      `removed=${diff.removed.length}`,
      `existing=${diff.existing.length}`,
      `vulnerabilities=${diff.added.reduce((sum, finding) => sum + (finding.footprint?.advisories.length ?? 0), 0)}`,
      ""
    ].join("\n"));
  }
  const token = input(env, "github-token");
  if (pullRequest && input(env, "comment", "true") !== "false" && token) {
    try {
      const outcome = await upsertComment(options, token, pullRequest.number, report, diff.added.length === 0);
      write(`PR comment: ${outcome}`);
    } catch (error) {
      write(annotation("warning", `Couldn't comment on the pull request (${error.message}). The report is in the job summary.`, { title: "Deadweight" }));
    }
  }
  const failed = shouldFail(diff, failOn);
  write(diff.added.length > 0 ? `Deadweight: ${compared ? "this pull request adds" : "found"} ${summarize(diff.added)}.` : "Deadweight: no new unused code.");
  if (failed) {
    write(`::error title=Deadweight::This pull request adds ${summarize(diff.added)} (fail-on: ${failOn}).`);
  }
  return { diff, report, failed };
}
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  run({ env: process.env }).then(
    ({ failed }) => process.exit(failed ? 1 : 0),
    (error) => {
      process.stdout.write(`::error title=Deadweight::${error.message.replace(/\r?\n/g, "%0A")}
`);
      process.exit(1);
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkoutBaseWithGit,
  run
});
