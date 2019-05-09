/* eslint-disable */

module.exports = transform;
var pathMod =
  typeof require !== 'undefined'
    ? require('path')
    : {
        basename() {
          return 'File';
        },
        extname() {
          return '.js';
        },
      };

function transform(babel) {
  let registrations = new WeakMap();
  let hookSignatures = new WeakMap();
  let t = babel.types;

  let buildSetCurrentModule = babel.template(`
    if (typeof __setCurrentModule__ !== 'undefined') {
      __setCurrentModule__(module)
    }
  `);

  let buildModuleHotAcceptCall = babel.template(`
    function __hotErrorHandler__(err) {
      require.cache[module.id].hot.accept(__hotErrorHandler__);
    }
    if (__shouldAccept__(module.__proto__.exports)) {
      module.hot.accept(__hotErrorHandler__);
    }
  `);

  return {
    visitor: {
      FunctionDeclaration: function(path, state) {
        // TODO: better heuristics
        const name = path.node.id && path.node.id.name;
        if (name && /^use[A-Z]/.test(name)) {
          // Hook
          extractHookSignature(path);
          addSignatureAfter(path, path.node.id);
        } else if (
          doesReturnJSX(path.node.body) ||
          (name && /^[A-Z]/.test(name))
        ) {
          // Likely component
          extractHookSignature(path);
          addSignatureAfter(path, path.node.id);

          var displayName;
          if (path.parentPath.node.type === 'ExportDefaultDeclaration') {
            if (path.node.id == null) {
              // An anonymous function declaration in export default declaration.
              // Transform `export default function () { ... }`
              // to `var _uid1 = function () { .. }; export default __uid;`
              // then add displayName to _uid1
              var extension = pathMod.extname(state.file.opts.filename);
              var id = path.scope.generateUidIdentifier('uid');
              path.node.id = id;
              displayName = pathMod.basename(
                state.file.opts.filename,
                extension
              );
            }
            addRegisterAfter(path, path.node.id, displayName);
          } else if (
            path.parentPath.node.type === 'Program' ||
            path.parentPath.node.type == 'ExportNamedDeclaration'
          ) {
            addRegisterAfter(path, path.node.id, displayName);
          }
        }
      },
      FunctionExpression: function(path, state) {
        const role = isLikelyComponentOrHook(path);
        if (role) {
          extractHookSignature(path);
          var id = findCandidateNameForExpression(path);
          if (id) {
            addSignatureAfter(path, id);
            if (role === 'component') {
              addRegisterAfter(path, id);
            }
          }
        }
      },
      ArrowFunctionExpression: function(path, state) {
        const role = isLikelyComponentOrHook(path);
        if (role) {
          extractHookSignature(path);
          var id = findCandidateNameForExpression(path);
          if (id) {
            addSignatureAfter(path, id);
            if (role === 'component') {
              addRegisterAfter(path, id);
            }
          }
        }
      },
      CallExpression: {
        exit(path) {
          // TODO: proper HOC detection
          // This only catches export default hoc(Foo)
          if (path.parent.type === 'ExportDefaultDeclaration') {
            const args = path.node.arguments;
            const program = path.hub.file.path.node;
            const knownIDs = registrations.get(program);
            if (!knownIDs) {
              return;
            }
            if (args.length > 1 && args[0].type === 'Identifier') {
              if (knownIDs.has(args[0].name)) {
                // Consider this a HOC
                const hocName =
                  path.node.callee.name + '(' + args[0].name + ')';
                if (!knownIDs.has(hocName)) {
                  path.replaceWith(
                    t.callExpression(t.identifier('__register__'), [
                      path.node,
                      t.stringLiteral(hocName),
                    ])
                  );
                }
              }
            }
          }
        },
      },
      Program: {
        exit(path) {
          const isBuiltIn =
            path.hub.file.opts.filename &&
            path.hub.file.opts.filename.indexOf('/webpack/') > -1;

          if (!isBuiltIn) {
            path.unshiftContainer('body', buildSetCurrentModule());
          }
          if (registrations.has(path.node)) {
            path.pushContainer('body', buildModuleHotAcceptCall());
          }
        },
      },
    },
  };

  function addRegisterAfter(path, nameNodeId, displayName) {
    const program = path.hub.file.path.node;
    if (!registrations.has(program)) {
      registrations.set(program, new Set());
    }
    registrations.get(program).add(nameNodeId.name || 'Unknown');

    if (!displayName) {
      displayName = nameNodeId.name;
    }

    var blockLevelStmnt;
    path.find(function(path) {
      if (path.parentPath.isBlock()) {
        blockLevelStmnt = path;
        return true;
      }
    });

    if (blockLevelStmnt) {
      var trailingComments = blockLevelStmnt.node.trailingComments;
      delete blockLevelStmnt.node.trailingComments;

      var setDisplayNameStmn = t.expressionStatement(
        t.callExpression(t.identifier('__register__'), [
          nameNodeId,
          t.stringLiteral(
            displayName + '::' + hash(path.hub.file.opts.filename)
          ),
        ])
      );

      blockLevelStmnt.insertAfter(setDisplayNameStmn);
      blockLevelStmnt.insertAfter();
    }
  }

  function addSignatureAfter(path, nameNodeId) {
    if (!hookSignatures.has(path)) {
      return;
    }

    var blockLevelStmnt;
    path.find(function(path) {
      if (path.parentPath.isBlock()) {
        blockLevelStmnt = path;
        return true;
      }
    });

    if (blockLevelStmnt) {
      var trailingComments = blockLevelStmnt.node.trailingComments;
      delete blockLevelStmnt.node.trailingComments;

      var signatureExpression = t.expressionStatement(
        t.callExpression(t.identifier('__signature__'), [
          nameNodeId,
          hookSignatures.get(path).signature,
          hookSignatures.get(path).custom,
        ])
      );

      blockLevelStmnt.insertAfter(signatureExpression);
      blockLevelStmnt.insertAfter();
    }
  }

  function extractHookSignature(path) {
    let customCallees = [];
    let hooks = [];
    path.traverse({
      CallExpression(p) {
        const name = p.node.callee.name;
        if (!/^use[A-Z]/.test(name)) {
          return;
        }
        let key = name;
        if (p.parent.id) {
          key += '$' + p.parentPath.get('id').getSource();
        }
        if (
          name === 'useEffect' ||
          name === 'useLayoutEffect' ||
          name === 'useMemo' ||
          name === 'useCallback' ||
          name === 'useImperativeMethods'
        ) {
          const argsPath = p.get('arguments');
          if (argsPath.length > 0) {
            const lastArgPath = argsPath[argsPath.length - 1];
            if (lastArgPath.node.type === 'ArrayExpression') {
              key += '$' + lastArgPath.getSource();
            }
          }
        } else if (name === 'useState' || name === 'useReducer') {
          // Other built-in ones
        } else {
          customCallees.push(p.node.callee);
        }
        hooks.push(key);
      },
    });
    if (hooks.length > 0) {
      hookSignatures.set(path, {
        signature: t.stringLiteral(hooks.join('::')),
        custom: t.arrowFunctionExpression([], t.arrayExpression(customCallees)),
      });
    }
  }
}

function hash(str) {
  if (typeof require === 'undefined') {
    return str;
  }
  return require('crypto')
    .createHash('md5')
    .update(str)
    .digest('hex');
}

function componentNameFromFilename(filename) {
  var extension = pathMod.extname(filename);
  var name = pathMod.basename(filename, extension);
  return name;
}

function isLikelyComponentOrHook(path, knownComponents) {
  // Parent must be either 'AssignmentExpression' or 'VariableDeclarator' or 'CallExpression' with a parent of 'VariableDeclarator'
  var id;
  if (
    path.parentPath.node.type === 'AssignmentExpression' &&
    path.parentPath.node.left.type !== 'MemberExpression' && // skip static members
    path.parentPath.parentPath.node.type == 'ExpressionStatement' &&
    path.parentPath.parentPath.parentPath.node.type == 'Program'
  ) {
    id = path.parentPath.node.left;
  } else {
    // if parent is a call expression, we have something like (function () { .. })()
    // move up, past the call expression and run the rest of the checks as usual
    if (path.parentPath.node.type === 'CallExpression') {
      path = path.parentPath;
    }

    if (path.parentPath.node.type === 'VariableDeclarator') {
      if (
        path.parentPath.parentPath.parentPath.node.type ===
          'ExportNamedDeclaration' ||
        path.parentPath.parentPath.parentPath.node.type === 'Program'
      ) {
        id = path.parentPath.node.id;
      }
    }
  }

  if (id) {
    if (id.name) {
      const charCode = id.name.charCodeAt(0);
      if (charCode >= 65 && charCode <= 90) {
        // A-Z
        return 'component';
      }
      if (id.name.slice(0, 3) === 'use') {
        return 'hook';
      }
    }
    return doesReturnJSX(path.node.body) ? 'component' : null;
  }

  return false;
}

function classHasRenderMethod(path) {
  if (!path.node.body) {
    return false;
  }
  var members = path.node.body.body;
  for (var i = 0; i < members.length; i++) {
    if (members[i].type == 'ClassMethod' && members[i].key.name == 'render') {
      return true;
    }
  }

  return false;
}

// https://github.com/babel/babel/blob/master/packages/babel-plugin-transform-react-display-name/src/index.js#L62-L77
// crawl up the ancestry looking for possible candidates for displayName inference
function findCandidateNameForExpression(path) {
  var id;
  path.find(function(path) {
    if (path.isAssignmentExpression()) {
      id = path.node.left;
      // } else if (path.isObjectProperty()) {
      // id = path.node.key;
    } else if (path.isVariableDeclarator()) {
      id = path.node.id;
    } else if (path.isStatement()) {
      // we've hit a statement, we should stop crawling up
      return true;
    }

    // we've got an id! no need to continue
    if (id) return true;
  });
  return id;
}

function doesReturnJSX(body) {
  if (!body) return false;
  if (body.type === 'JSXElement') {
    return true;
  }

  var block = body.body;
  if (block && block.length) {
    var lastBlock = block.slice(0).pop();

    if (lastBlock.type === 'ReturnStatement') {
      return (
        lastBlock.argument !== null && lastBlock.argument.type === 'JSXElement'
      );
    }
  }

  return false;
}
