#!/usr/bin/env node
const { program } = require('commander');
const { greet } = require('./commands');

program.command('greet').action(() => console.log(greet()));
program.parse();
