const https = require("https")
const AWS = require("aws-sdk")

const GITHUB_COMMIT_STATE = {
  SUCCESS: "success",
  FAILURE: "failure",
  PENDING: "pending"
}

const getGithubAccessToken = () => {
  return new Promise((resolve, reject) => {
    const secretKeyArn =
      "arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:GITHUB_PERSONAL_ACCESS_TOKEN-L5J3rs";
    const client = new AWS.SecretsManager({ region: "ap-northeast-1" });
    client.getSecretValue({ SecretId: secretKeyArn }, (err, data) => {
      if (err) return reject(err);
      const githubToken = JSON.parse(data.SecretString).value;
      resolve(githubToken);
    });
  });
};

const updateCommitStatusToFail = (commitId, state, description ,githubToken) => {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.github.com",
        path: `/repos/simpsons01/CodebuildWithGithubActionDemo/statuses/${commitId}`,
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "user-agent": "node.js",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (data) => chunks.push(data));
        res.on("end", () => {
          console.log("update github commit status successfully");
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
      }
    );
    req.on("error", (err) => {
      console.log("fail to update github commit status");
      reject(err);
    });
    req.write(JSON.stringify({
      owner: "OWNER",
      repo: "REPO",
      sha: "SHA",
      state,
      description,
      context: "CodeBuild",
    }));
    req.end();
  });
};


exports.handler = async function(event, ctx, cb) {
  const commitId = event.detail["additional-information"]["source-version"]
  if(commitId) {
    console.log(`source version is ${commitId}`)
    try {
      const githubAccessToken = await getGithubAccessToken()
      const result = await updateCommitStatusToFail(
        commitId, 
        GITHUB_COMMIT_STATE.FAILURE,
        "The build failed!",
        githubAccessToken
      )
      console.log(JSON.stringify(result))
      cb(null, 200);
    }catch(err) {
      console.log(JSON.stringify(err))
      cb(Error(JSON.stringify(err)))
    }
  }else {
    console.log("commit id is not found")
    cb(Error("commit id is not found"))
  }
}