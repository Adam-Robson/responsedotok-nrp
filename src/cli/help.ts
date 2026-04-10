export function printHelp(): void {
  console.info(`
    nrp — Node Reverse Proxy

    **USAGE**
    
    nrp [options]


    **OPTIONS**

    -c, --config <path>      Path to config file (default: ./proxy.config.json)
    -l, --log-level <level>  Log level: debug | info | warn | error | silent (default: info)
    -e, --env <key=value>    Set environment variables (can be used multiple times, or set .env file in root directory. If you use an .env file,
                             do not forget to add it to .gitignore so it will not go to version control.)
    -b, --balancer <name>    Load balancer strategy: round-robin | random | weighted (overrides config)
    -h, --help               Show this help message

    **CONFIG FORMAT**

    DEFAULT CONFIG FILE: proxy.config.json

    {
      "port": 8080,
      "balancer": "round-robin",
      "headers": {
        "response": { "X-Powered-By": "nrp" }
      },
      "routes": [
        {
          "match": "/api",
          "rewrite": { "stripPrefix": "/api" },
          "upstreams": [
            { "host": "localhost", "port": 3001 },
            { "host": "localhost", "port": 3002 }
          ]
        },
        {
          "match": "/",
          "upstreams": [{ "host": "localhost", "port": 3000 }]
        }
      ]
    }

    **EXAMPLES**
    
    nrp
    nrp --config ./config/dev.json --log-level debug
`);
}
