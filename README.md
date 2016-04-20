# gitrdone

OSS, AWS Lambda-backed (Serverless) Dones with Slack integration


## Installation

Installation and deployment must be performed by an Administrator of your team's AWS account.

Install the [Serverless](http://docs.serverless.com) framework via npm: (requires Node V4)

    npm install serverless -g

Clone this repository (or a fork of it) and `cd` into the root directory. Then install the dependencies

    npm install

Run the following command to initialize your customized version of `gitrdone`. This will generate a `_meta` directory which should not be committed to public repositories. The included `.gitignore` will prevent you from committing the sesitive files, but it is important to remember that they are there.

Note: You can change the `-s` argument if you want to setup a different stage for testing (i.e. `development` or `staging`). I recommend just using one stage (`production`).

    serverless project init -s production

## TODO

* Document env configuration, how to generate slss metadata
* Add prompts to post-init hook for entering Slack & GitHub configs
* Fail gracefully during auth flow, render HTML or plaintext errors
* Support custom domain
