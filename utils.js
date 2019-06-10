/*
  Copyright (c) 2011-2012, Giovanni Campagna <scampa.giovanni@gmail.com>
                     2019, Gustavo Sousa <gustavocms@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the GNOME nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
  DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;

const Soup = imports.gi.Soup;

/**
 * initTranslations:
 * @domain: (optional): the gettext domain to use
 *
 * Initialize Gettext to load translations from extensionsdir/locale.
 * If @domain is not provided, it will be taken from metadata['gettext-domain']
 */
function initTranslations(domain) {
  let extension = ExtensionUtils.getCurrentExtension();

  domain = domain || extension.metadata['gettext-domain'];
  // check if this extension was built with "make zip-file", and thus
  // has the locale files in a subfolder
  // otherwise assume that extension has been installed in the
  // same prefix as gnome-shell
  let localeDir = extension.dir.get_child('locale');
  if (localeDir.query_exists(null))
    Gettext.bindtextdomain(domain, localeDir.get_path());
  else
    Gettext.bindtextdomain(domain, Config.LOCALEDIR);
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
  let extension = ExtensionUtils.getCurrentExtension();

  schema = schema || extension.metadata['settings-schema'];
  const GioSSS = Gio.SettingsSchemaSource;

  // check if this extension was built with "make zip-file", and thus
  // has the schema files in a subfolder
  // otherwise assume that extension has been installed in the
  // same prefix as gnome-shell (and therefore schemas are available
  // in the standard folders)
  let schemaDir = extension.dir.get_child('schemas');
  let schemaSource;
  if (schemaDir.query_exists(null))
    schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
      GioSSS.get_default(),
      false);
  else
    schemaSource = GioSSS.get_default();

  let schemaObj = schemaSource.lookup(schema, true);
  if (!schemaObj)
    throw new Error('Schema ' + schema + ' could not be found for extension ' + extension.metadata.uuid + '. Please check your installation.');

  return new Gio.Settings({
    settings_schema: schemaObj
  });
}

function syncFetch(url) {
  let sessionSync = new Soup.SessionSync();
  let msg = Soup.Message.new('GET', url);
  sessionSync.send_message(msg);

  return msg;
}

function syncFetchData(url) {
  let msg = syncFetch(url);
  return msg.response_body.data;
}

function syncFetchJSON(url) {
  let data = syncFetchData(url);
  return data ? JSON.parse(data) : null;
}

function toJson(obj) {
  if (obj == null)
    return 'null';

  if (typeof obj == 'string')
    return '"' + obj + '"';

  if (Array.isArray(obj))
    return '[' + obj.map(toJson).join(', ') + ']';

  if (typeof obj != 'object')
    return toJson(obj.toString());

  return '{' + Object.keys(obj).map(k => toJson(k) + ': ' + toJson(obj[k])).join(', ') + '}';
}

function parseResult(input) {
  let booksRegex = /<a href=.(book\/index[^'" ]+)[^>]+>([^<]+)/;
  if (!input.match(booksRegex))
    return null;

  let regexTD = /<td[^>]*>(.*)<\/td>/;
  let tds = input.split('<td').map(it => '<td' + it)
    .map(it => it.match(regexTD))
    .filter(it => it)
    .map(it => it[1]);

  let idRegex = /\s*(\d+)\s*/;
  let id = tds[0].match(idRegex)[1];

  let bookMatch = tds[2].match(booksRegex);
  let url = bookMatch[1];
  let title = bookMatch[2].replace(/\s+/g, ' ');

  let result = {
    id: id,
    title: title,
    url: url
  };

  let authorRegex = /req=([^&]*)&column/;
  let authors = null;
  let authorsString = null;

  if (tds[1]) {
    authors = tds[1].match(RegExp(authorRegex, 'g')).map(it => it.match(authorRegex)[1].trim());

    if (authors.length > 0)
      authorsString = authors[0];
    if (authors.length == 2)
      authorsString += ' & ' + authors[1];
    else if (authors.length > 2)
      authorsString += ' et al.'

    if (authors && authors.length > 0) {
      result.authors = authors;
      result.author = authorsString;
    }
  }

  let year = tds[4].match(/\d+/);
  if (year && parseInt(year) > 1)
    result.year = year;

  let pages = tds[5].match(/\d+/);
  if (pages)
    result.pages = pages;

  return result;
}


function parseResultsHTML(input) {
  return input.split('<tr')
    .map(it => '<tr' + it.replace(/[\t\n\r ]+/g, ' '))
    .map(parseResult)
    .filter(it => it);
}
