/*
 * Sample Search Provider
 * A sample and base project to integrate custom search providers in GNOME Shell.
 * This code provides a simple outline for a GNOME Extension that adds a new search into
 * the GNOME Shell search.
 *
 * Copyright (C) 2019
 *     Sebastian Leidig <sebastian.leidig@gmail.com
 *
 * based on WordReference Search Provider by
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

const Soup = imports.gi.Soup;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Extension.imports.utils;



const PROTOCOL = 'https';
const BASE_URL = 'www.wordreference.com';
const USER_AGENT = 'GNOME Shell - WordReferenceSearchProvider - extension';
const HTTP_TIMEOUT = 10;



class SampleSearchClient {
    constructor() {
        this._protocol = PROTOCOL;
        this._base_url = BASE_URL;
        this._settings = Utils.getSettings();
        this._settings.connect("changed", () => { /* update config for new settings if necessary */ });
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
    get(searchterm, callback) {
        let query_url = this._buildQueryUrl(searchterm);
        let request = Soup.Message.new('GET', query_url);
        _get_soup_session().queue_message(request, (http_session, message) => {
            if(message.status_code !== Soup.KnownStatusCode.OK) {
                let error_message =
                    "SampleSearchClient:get(): Error code: %s".format(
                        message.status_code
                    );
                callback(error_message, null);
            } else {
                const results = this._parseResults(message.response_body.data);

                if(results.length > 0){
                    callback(null, results);
                    return;
                } else {
                    let error = "Nothing found";
                    callback(error, null);
                }
            }
        });
    }

    _buildQueryUrl(searchterm) {
        let dictionary = "definition";
        let word = searchterm.substring(2).trim();
        let url = '%s://%s/%s/%s'.format(
            this._protocol,
            this._base_url,
            dictionary,
            encodeURIComponent(word)
        );
        return url;
    }

    _parseResults(data) {
        let parsedResults = [];

        let sampleItem1 = {
            id: 'index_'+1,
            name: 'Sample 1',
            url: 'http://www.google.com',
            description: 'these details are just examples'
        };
        parsedResults.push(sampleItem1);

        let sampleItem2 = {
            id: 'index_'+2,
            name: 'Another One',
            url: 'http://www.google.com',
            description: 'who knows ...'
        };
        parsedResults.push(sampleItem2)


        return parsedResults;
    }



    destroy() {
        _get_soup_session().run_dispose();
        _SESSION = null;
    }
}



//TODO: should/could _SESSION be inside the SearchClient class?
let _SESSION = null;

function _get_soup_session() {
    if(_SESSION === null) {
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
    return new SampleSearchClient();
}
