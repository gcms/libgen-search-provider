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

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Extension.imports.utils;

const Soup = imports.gi.Soup;

class ConsoleSearchClient {
  constructor() {
    this.limit = 10;

    this._base_url = 'http://libgen.io/';
    this._search_url = this._base_url + 'search.php?req=';

    let home_dir = GLib.get_home_dir();
    this._extension_name = 'libgen-search-provider@gustavocms.gmail.com';
    this._extension_dir = home_dir + '/.local/share/gnome-shell/extensions/' + this._extension_name;
    this._search_command = this._extension_dir + '/search.py';
  }

  _log(text) {
    let file = Gio.file_new_for_path(this._extension_dir + '/log');
    let fos = file.append_to(Gio.FileCreateFlags.NONE, null);
    fos.write(text + '\n', null);
    fos.close(null);
  }

  _buildQueryUrl(searchterm) {
    let url = '%s%s'.format(
      this._search_url,
      encodeURIComponent(searchterm)
    );
    return url;
  }

  /**
   * Query search results and return them through a callback.
   * @param searchterm {string} text entered by the user for searching
   * @param callback {function(error, results)} return results asyncronously by calling this callback,
   *                 error {string} error message or null if no error
   *                 results {object[]} array of result items each defining the following attributes:
   *                         id {string}
   *                         name {string}
   *                         description {string}
   *                         url
   */
  get(terms, callback) {
    terms.shift();
    let searchterm = terms.join(" ");

    let query_url = this._buildQueryUrl(searchterm);
    this._log("QUERY URL: " + query_url);

    let request = Soup.Message.new('GET', query_url);
    _get_soup_session().queue_message(request, (http_session, message) => {
      this._log("Result: " + message.status_code);
      if (message.status_code !== Soup.KnownStatusCode.OK) {
        let error_message = "SampleSearchClient:get(): Error code: %s".format(message.status_code);
        this._log("Error: " + message.status_code);
        callback(error_message, null);
      } else {
        this._log("Response: " + message.response_body.data);
        const rawResults = Utils.parseResultsHTML(message.response_body.data);

        if (rawResults && rawResults.length > 0) {
          this._log("NResults: " + rawResults.length);

          callback(null, this._parseResults(rawResults));
        } else {
          let error = "Nothing found";
          callback(error, null);
        }
      }
    });
  }

  _parseResults(rawResultsArray) {
    let base_url = this._base_url;
    return rawResultsArray.map((item, index) => {
      return {
        id: item.id,
        name: item.title,
        description: this._parseDescription(item),
        url: base_url + item.url
      };
    });
  }

  _parseDescription(item) {
    var desc = ' by <b>' + item.author + '</b>';
    if (item.year != null && /^[0-9]+$/.test(item.year))
      desc = desc + ' (' + item.year + ')';

    return desc;
  }


  destroy() {
    this._log("Destroying");
    _get_soup_session().run_dispose();
    _SESSION = null;
  }
}

const USER_AGENT = 'GNOME Shell - WordReferenceSearchProvider - extension';
const HTTP_TIMEOUT = 10;


let _SESSION = null;

function _get_soup_session() {
  if (_SESSION === null) {
    _SESSION = new Soup.SessionAsync();
    Soup.Session.prototype.add_feature.call(
      _SESSION,
      new Soup.ProxyResolverDefault()
    );
    _SESSION.user_agent = USER_AGENT;
    _SESSION.timeout = HTTP_TIMEOUT;
  }

  return _SESSION;
}

/**
 * Factory function called by extension.js to get an instance of a SearchClient.
 * @returns {SearchClient} instance of a SearchClient implementation providing the following methods:
 *             get(searchterm, callback)
 *             destroy()
 */
function getSearchClient() {
  return new ConsoleSearchClient();
}
