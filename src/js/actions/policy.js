/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

define(function (require, exports) {
    "use strict";

    var Promise = require("bluebird");

    var adapterUI = require("adapter/ps/ui"),
        adapterOS = require("adapter/os"),
        locks = require("js/locks"),
        PolicyStore = require("js/stores/policy"),
        EventPolicy = require("js/models/eventpolicy"),
        KeyboardEventPolicy = EventPolicy.KeyboardEventPolicy;

    /**
     * Helper command to construct and install a single keydown policy.
     * 
     * @param {boolean} propagate Whether to propagate the keydown to Photoshop
     * @param {number|string} key Either a keyCode or a keyChar
     * @param {{shift: boolean=, control: boolean=, alt: boolean=, command: boolean=}} modifiers
     * @return {Promise.<number>} Resolves with the installed policy list ID
     */
    var addKeydownPolicyCommand = function (propagate, key, modifiers) {
        var policyAction = propagate ?
                adapterUI.policyAction.ALWAYS_PROPAGATE :
                adapterUI.policyAction.NEVER_PROPAGATE,
            eventKind = adapterOS.eventKind.KEY_DOWN;

        var policy = new KeyboardEventPolicy(policyAction, eventKind, modifiers, key);

        return this.transfer(addKeyboardPolicies, [policy], true);
    };

    /**
     * Install a new policy list.
     *
     * @private 
     * @param {string} kind A value defined in PolicyStore.eventKind
     * @param {Array.<KeyboardEventPolicy>} policies
     * @return {Promise}
     */
    var _addPolicies = function (kind, policies) {
        var policyStore = this.flux.store("policy"),
            policyListID = policyStore.addPolicyList(kind, policies),
            masterPolicyList = policyStore.getMasterPolicyList(kind),
            commitFn;

        if (kind === PolicyStore.eventKind.KEYBOARD) {
            commitFn = adapterUI.setKeyboardEventPropagationPolicy;
        } else {
            commitFn = adapterUI.setPointerEventPropagationPolicy;
        }

        return commitFn.call(adapterUI, masterPolicyList)
            .catch(function (err) {
                try {
                    policyStore.removePolicyList(kind, policyListID);
                } catch (err2) {
                    // ignore
                }
                
                throw err;
            })
            .return(policyListID);
    };

    /**
     * Remove an already-installed policy list.
     *
     * @param {string} kind A value defined in PolicyStore.eventKind
     * @param {number} id The ID of the installed policy list
     * @param {boolean=} commit Whether to commit the removal to Photoshop. If
     *  not set, the state will be changed locally, but Photoshop state will
     *  not be updated until the next commit. Useful when swapping policies.
     * @return {Promise}
     */
    var _removePolicies = function (kind, id, commit) {
        var policyStore = this.flux.store("policy");

        if (policyStore.removePolicyList(kind, id)) {
            if (commit) {
                var masterPolicyList = policyStore.getMasterPolicyList(kind),
                    commitFn;

                if (kind === PolicyStore.eventKind.KEYBOARD) {
                    commitFn = adapterUI.setKeyboardEventPropagationPolicy;
                } else {
                    commitFn = adapterUI.setPointerEventPropagationPolicy;
                }

                return commitFn.call(adapterUI, masterPolicyList);
            } else {
                return Promise.resolve();
            }
        } else {
            return Promise.reject(new Error("No policies found for id: " + id));
        }
    };

    /**
     * Install a new keyboard policy list.
     *
     * @param {Array.<KeyboardEventPolicy>} policies
     * @return {Promise}
     */
    var addKeyboardPoliciesCommand = function (policies) {
        return _addPolicies.call(this, PolicyStore.eventKind.KEYBOARD, policies);
    };

    /**
     * Remove an already-installed keyboard policy list.
     *
     * @param {number} id The ID of the installed keyboard policy list
     * @param {boolean=} commit Whether to commit the removal to Photoshop. If
     *  not set, the state will be changed locally, but Photoshop state will
     *  not be updated until the next commit. Useful when swapping keyboard
     *  policies.
     * @return {Promise}
     */
    var removeKeyboardPoliciesCommand = function (id, commit) {
        return _removePolicies.call(this, PolicyStore.eventKind.KEYBOARD, id, commit);
    };

    /**
     * Install a new pointer policy list.
     *
     * @param {Array.<PointerEventPolicy>} policies
     * @return {Promise}
     */
    var addPointerPoliciesCommand = function (policies) {
        return _addPolicies.call(this, PolicyStore.eventKind.POINTER, policies);
    };

    /**
     * Remove an already-installed pointer policy list.
     *
     * @param {number} id The ID of the installed pointer policy list
     * @param {boolean=} commit Whether to commit the removal to Photoshop. If
     *  not set, the state will be changed locally, but Photoshop state will
     *  not be updated until the next commit. Useful when swapping pointer
     *  policies.
     * @return {Promise}
     */
    var removePointerPoliciesCommand = function (id, commit) {
        return _removePolicies.call(this, PolicyStore.eventKind.POINTER, id, commit);
    };

    /**
     * Set the default keyboard propagation policy.
     *
     * @return {Promise}
     */
    var beforeStartupCommand = function () {
        var policyMode = adapterUI.keyboardPropagationMode.NEVER_PROPAGATE,
            policyDescriptor = {
                defaultMode: policyMode
            };

        return adapterUI.setKeyboardPropagationMode(policyDescriptor);
    };

    var addKeydownPolicy = {
        command: addKeydownPolicyCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    var addKeyboardPolicies = {
        command: addKeyboardPoliciesCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    var removeKeyboardPolicies = {
        command: removeKeyboardPoliciesCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    var addPointerPolicies = {
        command: addPointerPoliciesCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    var removePointerPolicies = {
        command: removePointerPoliciesCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    /**
     * @see beforeStartupCommand
     * @type {Action}
     */
    var beforeStartup = {
        command: beforeStartupCommand,
        reads: [],
        writes: [locks.PS_APP, locks.JS_POLICY]
    };

    exports.addKeydownPolicy = addKeydownPolicy;
    exports.addKeyboardPolicies = addKeyboardPolicies;
    exports.removeKeyboardPolicies = removeKeyboardPolicies;
    exports.addPointerPolicies = addPointerPolicies;
    exports.removePointerPolicies = removePointerPolicies;

    exports.beforeStartup = beforeStartup;
});
