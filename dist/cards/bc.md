# NEXUM nx1.0 · pack bc: Business Central and AL (objects, fields, events, permissions, upgrade code, report layouts, APIs).
Declare bc in the first line to use these records.
al_object: table|tableextension|page|pageextension|pagecustomization|codeunit|report|reportextension|query|xmlport|enum|enumextension|interface|permissionset|permissionsetextension|profile|controladdin|entitlement
al_perm_object: tabledata|table|page|codeunit|report|query|xmlport|system
Records:
obj <al_object> <id> <name> st:new|mod|del ext: — AL object
fld <table> <no> <name> st:new|mod|del type: — table field
evt <pub|sub> <object> <event> st:new|mod|del — event publisher or subscriber
perm <set> <al_perm_object> <object> <RIMDX|-> — permission in a permission set
upg <codeunit> <tag> ["what"] — upgrade code with upgrade tag
lay <report> <name> <rdlc|word|excel|custom> st:new|mod|del def:y|n — report layout
api <object> <publisher/group/version> <entity> st:new|mod|del ops: — API page or query
Adds keys: ctx app: co: tenant: · f rule: · err rule:
