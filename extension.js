/*
 * Libgen Search Provider
 * A simple GNOME search provider for libgen resources
 *
 * Copyright (C) 2019
 *     Gustavo Sousa <gustavocms@gmail.com>
 *
 *
 * based on Search Providers by
 *     Sebastian Leidig <sebastian.leidig@gmail.com
 *     Lorenzo Carbonell <lorenzo.carbonell.cerezo@gmail.com>, https://www.atareao.es
 *
 * This file is part of Sample Search Provider
 *
 * Sample Search Provider is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Sample Search Provider is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-openweather.
 * If not, see <http://www.gnu.org/licenses/>.
 */



/** IMPORTS **/
const St = imports.gi.St;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Extension.imports.utils;

const Gettext = imports.gettext.domain(Extension.metadata.uuid);
const _ = Gettext.gettext;



/** APP CONFIG **/
const APP_NAME = 'Libgen Search';
const ICON_NAME = 'sample-search';
const APP_COMMAND_FACTORY = (terms => {
  return 'xdg-open http://libgen.io/search?q=' + terms;
});


const SEARCH_KEYWORDS = ['libgen', 'book', 'magazine'];

const SEARCH_TERMS_FILTER = (terms => {
  if (terms.length < 2 || terms[1].length < 4)
    return false;

  let test_keyword = function(term) {
    return SEARCH_KEYWORDS.includes(term.toLowerCase());
  }

  return test_keyword(terms[0]);
});

// see search_client_sample_from_web.js or search_client_sample_from_console.js
const SEARCH_CLIENT = Extension.imports.search_client_sample_from_console;



/**
 * Wraps a "Search Client" implementation (see search_client_sample.js) and
 * implements the methods required for GNOME Shell Extension to be used as a search provider.
 * An instance of this class can be registered with GNOME using "Main.overview.viewSelector._searchResults._registerProvider(genericSearchProviderInstance)"
 */
class GenericSearchProvider {
  /**
   * Create a new GenericSearchProvider configured with the passed arguments:
   * @param {string} appName The human-readable name displayed for the extension.
   * @param {string} iconName The filename of the icon within the extensions "icons" subfolder
   * @param {Function} appCommandFactory A function receiving the search terms generating a command to launch the search in the app.
   * @param {Function} isRelevantSearchTermsFunction A function receiving the search terms as a parameter and evaluating to true if the SearchProvider should be displayed for this query.
   * @param {SearchClient} clientApi An instance of a SearchClient managing the retrieval of actual results.
   */
  constructor(appName, iconName, appCommandFactory, isRelevantSearchTermsFunction, clientApi) {
    this._appName = appName;
    this._iconName = iconName;
    this._generateAppCommand = appCommandFactory;
    this._isRelevantSearchTerms = isRelevantSearchTermsFunction;
    this._api = clientApi;

    Gtk.IconTheme.get_default().append_search_path(Extension.dir.get_child('icons').get_path());

    this.appInfo = this._getAppInfoForOpeningFullSearch();
    this._messages = this._getMessagesAsResults();
    this.resultsMap = new Map(); // API results will be stored here; key:string, value:metaObject (see _getMessagesAsResults() for examples)

    // Wait before making an API request
    this._timeoutId = 0;
  }

  /**
   * Get AppInfo of the app with which full search should be launched.
   * @returns {Gio.AppInfo}
   * @private
   */
  _getAppInfoForOpeningFullSearch() {
    // Use the default app for opening https links as the app for launching full search.
    let app = Gio.AppInfo.get_default_for_uri_scheme('https');
    // Fake the name and icon of the app
    app.get_name = () => {
      return this._appName;
    };
    app.get_icon = () => {
      return new Gio.ThemedIcon({
        name: this._iconName
      });
    };
    return app;
  }

  /**
   * Return custom messages that will be shown as search results
   */
  _getMessagesAsResults() {
    return {
      '__loading__': {
        id: '__loading__',
        name: _(this._appName),
        description: _('Loading items from ' + this._appName + ', please wait...'),
        // TODO: do these kinds of icon creations better
        createIcon: this._createIconGenerator()
      },
      '__error__': {
        id: '__error__',
        name: _(this._appName),
        description: _('Oops, an error occurred while searching.'),
        createIcon: this._createIconGenerator()
      }
    };
  }

  _createIconGenerator() {
    let iconName = this._iconName;
    return (size) => {
      let box = new Clutter.Box();
      let icon = new St.Icon({
        gicon: new Gio.ThemedIcon({
          name: iconName
        }),
        icon_size: size
      });
      box.add_child(icon);
      return box;
    };
  }



  /**
   * Search API if the query is matches the SEARCH_TERMS_FILTER for the app.
   * This function is called by GNOME Shell when the user starts a search.
   * @param {Array} terms
   * @param {Function} callback
   * @param {Gio.Cancellable} cancellable
   */
  getInitialResultSet(terms, callback, cancellable) {
    if (terms != null && terms.length >= 1 && this._isRelevantSearchTerms(terms)) {
      // show the loading message
      this._showMessage('__loading__', callback);
      // remove previous timeout
      if (this._timeoutId > 0) {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
      }
      this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
        // now search
        this._api.get(
          terms,
          (error, result) => {
            this._getResultSet.bind(this)(error, result, callback, this._timeoutId);
          }
        );
        return false;
      });
    } else {
      // return an emtpy result set
      this._getResultSet(null, {}, callback, 0);
    }
  }

  /**
   * Show any message as a search item
   * @param {String} identifier Message identifier
   * @param {Function} callback Callback that pushes the result to search overview
   */
  _showMessage(identifier, callback) {
    callback([identifier]);
  }

  /**
   * Parse results that we get from the API and save them in this.resultsMap.
   * Inform the user if no results are found.
   * @param {null|String} error
   * @param {Object|null} result
   * @param {Function} callback
   * @private
   */
  _getResultSet(error, result, callback, timeoutId) {
    let results = [];
    if (timeoutId === this._timeoutId && result && result.length > 0) {
      result.forEach((aresult) => {
        this.resultsMap.set(aresult.id, aresult);
        results.push(aresult.id);
      });
      callback(results);
    } else if (error) {
      // Let the user know that an error has occurred.
      this._showMessage('__error__', callback);
    }
  }



  /**
   * Run callback with results
   * //TODO: what does this mean? When/How is this executed exactly?
   * @param {Array} identifiers
   * @param {Function} callback
   */
  getResultMetas(identifiers, callback) {
    let metas = [];
    for (let i = 0; i < identifiers.length; i++) {
      let result;
      // return predefined message if it exists
      if (identifiers[i] in this._messages) {
        metas.push(this._messages[identifiers[i]]);
      } else {
        // TODO: check for messages that don't exist, show generic error message
        let meta = this.resultsMap.get(identifiers[i]);
        if (meta) {
          metas.push({
            id: meta.id,
            name: meta.name,
            description: meta.description,
            createIcon: this._createIconGenerator()
          });
        }
      }
    }
    callback(metas);
  }



  /**
   * Open the url in default app.
   * This function is called by GNOME Shell when the user clicks on a result.
   * @param {String} identifier
   * @param {Array} terms
   * @param timestamp
   */
  activateResult(identifier, terms, timestamp) {
    let result;
    // only do something if the result is not a custom message
    if (!(identifier in this._messages)) {
      result = this.resultsMap.get(identifier);
      if (result) {
        let url = result.url ? result.url : result.getUrl ? result.getUrl() : null;
        if (url)
          Util.trySpawnCommandLine('xdg-open "' + url + '"');
      }
    }
  }



  /**
   * Launch the search in the actual application.
   * This function is called by GNOME Shell when the user clicks on the Extension icon & name displayed to the left of its results.
   * @param {String[]} terms
   */
  launchSearch(terms) {
    Util.trySpawnCommandLine(this._generateAppCommand(terms));
  }



  /**
   * Return subset of results
   * @param {Array} results
   * @param {number} max
   * @returns {Array}
   */
  filterResults(results, max) {
    // override max for now
    max = this._api.limit; //TODO: _api.limit is probably never defined! (at least WordReferenceClient never sets it)
    return results.slice(0, max);
  }



  /**
   * TODO: implement
   * @param {Array} previousResults
   * @param {Array} terms
   * @returns {Array}
   */
  getSubsetResultSearch(previousResults, terms) {
    return [];
  }

  getSubsearchResultSet(previousResults, terms) {
    return previousResults.filter(item => {
      for (var i = 1; i < terms.length; i++) {
        if (!item.name)
          return false;
        if (!item.name.toLowerCase().includes(terms[i]))
          return false;
      }
    });
  }



  destroy() {
    this._api.destroy();
  }
}



let searchProvider = null;


/**
 * Will be invoked by GNOME Shell at most once directly after your source JS file is loaded.
 * Setup whatever needs to be setup here, such as labels, text, icons or actors, prior to enabling the extension. It is only called once per shell session.
 * You should make user interfaces visible/hidden in the separate enable/disable functions.
 */
function init() {
  Utils.initTranslations();
}


/**
 * Will be invoked by GNOME Shell when the extension is enabled by the user in the OS.
 * Make the Shell extension’s UI visible to the user here.
 */
function enable() {
  if (!searchProvider) {
    let client = SEARCH_CLIENT.getSearchClient();
    searchProvider = new GenericSearchProvider(APP_NAME, ICON_NAME, APP_COMMAND_FACTORY, SEARCH_TERMS_FILTER, client);
    Main.overview.viewSelector._searchResults._registerProvider(
      searchProvider
    );
  }
}


/**
 * Will be invoked by GNOME Shell when the extension is disabled by the user in the OS.
 * Hide the Shell extension’s UI here.
 */
function disable() {
  if (searchProvider) {
    searchProvider.destroy();

    Main.overview.viewSelector._searchResults._unregisterProvider(
      searchProvider
    );
    searchProvider = null;
  }
}
