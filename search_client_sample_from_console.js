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

class ConsoleSearchClient {
  constructor() {
    this.limit = 10;
    this.server = 'http://libgen.io';

    let home_dir = GLib.get_home_dir();
    this._extension_name = 'libgen-search-provider@gustavocms.gmail.com';
    this._extension_dir = home_dir + '/.local/share/gnome-shell/extensions/' + this._extension_name;
    this._search_command = this._extension_dir + '/search.py';
  }

  _log(text) {
    let file = Gio.file_new_for_path(this._extension_dir + '/log');
    let fos = file.append_to(Gio.FileCreateFlags.NONE, null);
    fos.write(text, null);
    fos.close(null);
  }

  _search(searchterm) {
    let command = this._search_command + ' ' + this.server + ' "' + searchterm + '"';
    let output = GLib.spawn_command_line_sync(command);

    this._log(command + '\n');
    this._log(searchterm + '\n');
    this._log(output[1]);
    this._log('\n');

    var parsed = [];
    try {
      parsed = JSON.parse(output[1]);
      this._log("OK\n", null);
    } catch (e) {
      this._log(e.toString(), null);
    }

    return parsed;
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

    let json = this._search(searchterm);

    callback(null, json ? this._parseResults(json) : json);
  }

  _parseResults(rawResultsArray) {
    let server = this.server;
    return rawResultsArray.map((item, index) => {
      return {
        id: item.id,
        name: item.title,
        description: this._parseDescription(item),
        getUrl: function() {
          let query = server + '/json.php?fields=MD5&ids=' + item.id;
          let json = Utils.syncFetchJSON(server, query)
          let md5 = json ? json[0].md5 : null;
          let url = md5 ? server + '/item/index.php?md5=' + md5 : null;

          return url;
        }
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

  }
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
