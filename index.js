const core = require('@actions/core');
const github = require('@actions/github');

const http = require("@actions/http-client");

const fs = require('fs');
const exec = require('@actions/exec')
const glob = require('@actions/glob');

const dns = require('dns')
const util = require('util')


async function iptables() {

  await exec.exec("apk", ["add", "iptables", "bind-tools", "ca-certificates", "git"], silent = true,
    stdout = (data) => {
    },
    stderr = (data) => {
    },
  )
  await exec.exec("iptables", ["-t", "nat", "-N", "pse"], silent = true)
  await exec.exec("iptables", ["-t", "nat", "-A", "OUTPUT", "-j", "pse"], silent = true)

  const lookup = util.promisify(dns.lookup);
  const dresp = await lookup('pse');
  await exec.exec("iptables",
    ["-t", "nat", "-A", "pse", "-p", "tcp", "-m", "tcp", "--dport", "443", "-j", "DNAT", "--to-destination", dresp.address + ":12345"],
    silent = true,
    stdout = (data) => {
    },
    stderr = (data) => {
    },
  )

}

async function caSetup() {
  client = new http.HttpClient("pse-action", [], {
    ignoreSslError: true,
  });

  const res = await client.get('https://pse.invisirisk.com/ca');
  if (res.message.statusCode != 200) {
    core.error("error getting ca certificate, received status " + res.message.statusCode)
    throw "error getting ca  certificate"
  }
  const cert = await res.readBody()

  const caFile = "/etc/ssl/certs/pse.pem";
  fs.writeFileSync(caFile, cert);
  await exec.exec('update-ca-certificates');

  await exec.exec('git', ["config", "--global", "http.sslCAInfo", caFile]);
  core.exportVariable('NODE_EXTRA_CA_CERTS', caFile);

}

async function checkCreate() {
  /*
    const token = core.getInput('github-token');
    const octokit = new github.getOctokit(token);
    await octokit.rest.checks.create({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      name: 'Readme Validator',
      head_sha: github.context.sha,
      status: 'completed',
      conclusion: 'failure',
      output: {
        title: 'README.md must start with a title',
        summary: 'Please use markdown syntax to create a title',
      }
    });
    */
}

// most @actions toolkit packages have async methods
async function run() {
  try {
    let base = process.env.GITHUB_SERVER_URL + "/";
    let repo = process.env.GITHUB_REPOSITORY;

    await iptables();

    client = new http.HttpClient("pse-action", [], {
      ignoreSslError: true,
    });

    await caSetup();

    await checkCreate();

    let q = new URLSearchParams({
      'builder': 'github',
      'build_id': process.env.GITHUB_RUN_ID,
      build_url: base + repo + "/actions/runs/" + process.env.GITHUB_RUN_ID + "/attempts/" + process.env.GITHUB_RUN_ATTEMPT,
      project: process.env.GITHUB_REPOSITORY,
      builder_url: base,
      scm: 'git',
      scm_commit: process.env.GITHUB_SHA,
      //      scm_prev_commit = process,
      scm_branch: process.env.GITHUB_REF_NAME,
      scm_origin: base + repo,
    });
    await client.post('https://pse.invisirisk.com/start', q.toString(),
      {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
