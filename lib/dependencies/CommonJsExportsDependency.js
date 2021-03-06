/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const InitFragment = require("../InitFragment");
const { UsageState } = require("../ModuleGraph");
const RuntimeGlobals = require("../RuntimeGlobals");
const makeSerializable = require("../util/makeSerializable");
const propertyAccess = require("../util/propertyAccess");
const NullDependency = require("./NullDependency");

/** @typedef {import("webpack-sources").ReplaceSource} ReplaceSource */
/** @typedef {import("../Dependency")} Dependency */
/** @typedef {import("../Dependency").ExportsSpec} ExportsSpec */
/** @typedef {import("../DependencyTemplate").DependencyTemplateContext} DependencyTemplateContext */
/** @typedef {import("../ModuleGraph")} ModuleGraph */

class CommonJsExportsDependency extends NullDependency {
	constructor(range, base, names) {
		super();
		this.range = range;
		this.base = base;
		this.names = names;
	}

	get type() {
		return "cjs exports";
	}

	/**
	 * Returns the exported names
	 * @param {ModuleGraph} moduleGraph module graph
	 * @returns {ExportsSpec | undefined} export names
	 */
	getExports(moduleGraph) {
		return {
			exports: [this.names[0]],
			dependencies: undefined
		};
	}

	serialize(context) {
		const { write } = context;
		write(this.range);
		write(this.base);
		write(this.names);
		super.serialize(context);
	}

	deserialize(context) {
		const { read } = context;
		this.range = read();
		this.base = read();
		this.names = read();
		super.deserialize(context);
	}
}

makeSerializable(
	CommonJsExportsDependency,
	"webpack/lib/dependencies/CommonJsExportsDependency"
);

CommonJsExportsDependency.Template = class CommonJsExportsDependencyTemplate extends NullDependency.Template {
	/**
	 * @param {Dependency} dependency the dependency for which the template should be applied
	 * @param {ReplaceSource} source the current replace source which can be modified
	 * @param {DependencyTemplateContext} templateContext the context object
	 * @returns {void}
	 */
	apply(
		dependency,
		source,
		{ module, moduleGraph, initFragments, runtimeRequirements }
	) {
		const dep = /** @type {CommonJsExportsDependency} */ (dependency);
		let used;
		if (module.buildMeta.exportsType === "default") {
			const defaultInfo = moduleGraph.getExportInfo(module, "default");
			if (defaultInfo.used === UsageState.Used) {
				used = dep.names;
			} else {
				used = defaultInfo.exportsInfo.getUsedName(dep.names);
			}
		} else {
			used = moduleGraph.getExportsInfo(module).getUsedName(dep.names);
		}

		let base = undefined;
		let type;
		switch (dep.base) {
			case "exports":
				runtimeRequirements.add(RuntimeGlobals.exports);
				base = module.exportsArgument;
				type = "expression";
				break;
			case "module.exports":
				runtimeRequirements.add(RuntimeGlobals.module);
				base = `${module.moduleArgument}.exports`;
				type = "expression";
				break;
			case "this":
				runtimeRequirements.add(RuntimeGlobals.thisAsExports);
				base = "this";
				type = "expression";
				break;
			case "Object.defineProperty(exports)":
				runtimeRequirements.add(RuntimeGlobals.exports);
				base = module.exportsArgument;
				type = "Object.defineProperty";
				break;
			case "Object.defineProperty(module.exports)":
				runtimeRequirements.add(RuntimeGlobals.module);
				base = `${module.moduleArgument}.exports`;
				type = "Object.defineProperty";
				break;
			case "Object.defineProperty(this)":
				runtimeRequirements.add(RuntimeGlobals.thisAsExports);
				base = "this";
				type = "Object.defineProperty";
				break;
			default:
				throw new Error(`Unsupported base ${dep.base}`);
		}

		switch (type) {
			case "expression":
				if (!used) {
					initFragments.push(
						new InitFragment(
							"var __webpack_unused_export__;\n",
							InitFragment.STAGE_CONSTANTS,
							0,
							"__webpack_unused_export__"
						)
					);
					source.replace(
						dep.range[0],
						dep.range[1] - 1,
						"__webpack_unused_export__"
					);
					return;
				}
				source.replace(
					dep.range[0],
					dep.range[1] - 1,
					`${base}${propertyAccess(used)}`
				);
				return;
			case "Object.defineProperty":
				if (!used) {
					initFragments.push(
						new InitFragment(
							"var __webpack_unused_export__;\n",
							InitFragment.STAGE_CONSTANTS,
							0,
							"__webpack_unused_export__"
						)
					);
					source.replace(
						dep.range[0],
						dep.range[1] - 1,
						"__webpack_unused_export__ = ("
					);
					return;
				}
				source.replace(
					dep.range[0],
					dep.range[1] - 1,
					`Object.defineProperty(${base}${propertyAccess(
						used.slice(0, -1)
					)}, ${JSON.stringify(used[used.length - 1])}, `
				);
				return;
		}
	}
};

module.exports = CommonJsExportsDependency;
