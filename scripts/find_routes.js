const fs = require('fs');

function search(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + f.name;
    if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') {
      search(p);
    } else if (f.isFile() && f.name.endsWith('.js')) {
      const txt = fs.readFileSync(p, 'utf8');
      if (txt.includes('createTicket') || txt.includes('/ticket') || txt.includes('/listing')) {
        const matches = txt.match(/router\.(post|get|put|patch)\(['"`][^'"`]+['"`]/g);
        if (matches) {
          const relevant = matches.filter(m => m.includes('ticket') || m.includes('listing'));
          if (relevant.length) {
            console.log(p, relevant);
          }
        }
      }
    }
  }
}

search('src');
