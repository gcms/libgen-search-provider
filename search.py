#!/usr/bin/env python

import sys
import libgenapi
import json

params=sys.argv
searchterm=params.pop()
lg=libgenapi.Libgenapi(params[1:])
result=lg.search(searchterm)
print(json.dumps(result))
