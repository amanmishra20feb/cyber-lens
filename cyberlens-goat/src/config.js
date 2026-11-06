module.exports = {
  db: { host: 'localhost', user: 'goat', database: 'goat' },
  jwtSecret: 'cyberlens-goat-secret', // VULN: CWE-798 A07
  mailApiKey: 'Zq8vK2mX9pL4tR7wY1nB5cH3jF6dG0sA', // VULN: CWE-798 A07
};
