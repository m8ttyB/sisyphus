# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Mozilla Crash Automation Testing.
#
# The Initial Developer of the Original Code is
# Mozilla Corporation.
# Portions created by the Initial Developer are Copyright (C) 2010
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
# Bob Clary
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

import sys
from optparse import OptionParser
import os
import re
import couchquery

def ordered_ffversion(versionstring):
     versionstring = re.sub('[a-z].*$', '', versionstring)
     version = ''
     versionparts = re.split('[.]*', versionstring)
     for i in range(0,len(versionparts)):
         try:
             version += ( '00' +  versionparts[i] )[-2:]
         except:
             break # ignore and terminate

     return version

def main():

    usage = '''usage: %prog [options]

Initialize crashtest database.

Example:
%prog -d http://couchserver/crashtest -v 3.0,3.5,3.6,3.7
'''
    parser = OptionParser(usage=usage)
    parser.add_option('-d', '--database', action='store', type='string',
                      dest='databaseuri',
                      default='http://127.0.0.1:5984/crashtest',
                      help='uri to crashtest couchdb database. ' +
                      'Defaults to http://127.0.0.1:5984/crashtest')
    parser.add_option('-v', '--versions', action='store', type='string',
                      dest='supported_versions',
                      default='3.0:1.9.0,3.5:1.9.1,3.6:1.9.2,3.7:1.9.3',
                      help='Comma delimited string of supported Firefox major versions:branches. ' +
                      'Defaults to 3.0:1.9.0,3.5:1.9.1,3.6:1.9.2,3.7:1.9.3')
    parser.add_option('-i', '--ignoreurls', action='store', type='string',
                      dest='ignore_urls_filename',
                      default=None,
                      help='File containing list of url patterns to be ignored.')
    (options, args) = parser.parse_args()

    db = couchquery.Database(options.databaseuri)
    try:
        # attempt to create the database
        couchquery.createdb(db)
    except Exception, ex:
        # assume error is due to already existing db
        pass

    db.sync_design_doc('signatures', os.path.join(os.path.dirname(sys.argv[0]), 'crashtest_views'))

    supported_versions_doc = {"type" : "supported_versions", "supported_versions": {}}
    versionsbranches    = options.supported_versions.split(',')
    for versionbranch in versionsbranches:
         version, branch = versionbranch.split(':')
         supported_versions_doc["supported_versions"][ordered_ffversion(version)] = {"branch" : branch}

    supported_versions_rows = db.views.signatures.supported_versions()

    if len(supported_versions_rows) > 1:
        raise Exception("crashtest database has more than one supported_versions document")

    if len(supported_versions_rows) == 0:
        docinfo = db.create(supported_versions_doc)
        doc = db.get(docinfo['id'])
    else:
        doc = supported_versions_rows[0]
        doc.supported_versions = supported_versions_doc["supported_versions"]

    db.update(doc)

if __name__ == '__main__':
    main()