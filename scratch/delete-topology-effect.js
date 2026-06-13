const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'frontend', 'src', 'App.tsx');
let content = fs.readFileSync(appFile, 'utf8');

const startMarker = '  useEffect(() => {\n    if (activeTab === \'topology\' && topologyMode === \'graph\' &&';
const endMarker = '  }, [activeTab, topologyMode, topologyData]);';

const startIdx = content.indexOf(startMarker);
if (startIdx !== -1) {
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
        console.log('Successfully removed topology graph useEffect hook');
    } else {
        console.log('Could not find end marker for topology graph useEffect');
    }
} else {
    console.log('Could not find start marker for topology graph useEffect');
}

fs.writeFileSync(appFile, content, 'utf8');
console.log('Deletion script complete.');
