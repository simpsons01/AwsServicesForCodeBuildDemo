const https = require("https")
const AWS = require("aws-sdk")

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

const updateCommitStatusToSuccess = (event, commitId, githubToken) => {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.github.com",
        path: `/repos/simpsons01/CodebuildWithActionDemo/statuses/${commitId}`,
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
      state: "success",
      description: "The build succeeded!",
      context: event.detail["project-name"],
    }));
    req.end();
  });
};

const getBuildDetail = (event) => {
  return new Promise((resolve, reject) => {
    const buildId = event.detail["build-id"];
    const client = new AWS.CodeBuild();
    client.batchGetBuilds({ ids: [ buildId ] }, (err, data) => {
      if (err) return reject(err);
      resolve(data.builds[0]);
    });
  });
};

const getBatchBuildDetail = (batchBuildId) => {
  return new Promise((resolve, reject) => {
    const client = new AWS.CodeBuild();
    client.batchGetBuildBatches({ ids: [ batchBuildId ] }, (err, data) => {
      if (err) return reject(err);
      resolve(data.buildBatches[0]);
    });
  });
};

const wait = (sec) => {
  return new Promise(resolve => setTimeout(() => resolve(), sec * 1000))
}


exports.handler = async function(event, ctx, cb) {
  console.log(JSON.stringify(event))
  const commitId = event.detail["additional-information"]["source-version"]
  if(commitId) {
    console.log(`source version is ${commitId}`)
    try {
      const buildDetail = await getBuildDetail(event)
      console.log(buildDetail)
      await wait(3)
      const batchBuildDetail = await getBatchBuildDetail(buildDetail.buildBatchArn)
      console.log(batchBuildDetail)
      if(batchBuildDetail.buildBatchStatus === "SUCCEEDED") {
        const githubAccessToken = await getGithubAccessToken()
        const result = await updateCommitStatusToSuccess(event, commitId, githubAccessToken)
        console.log(result)
        cb(null, 200);
      }else {
        cb(null, 200);
      }
    }catch(err) {
      console.log(err)
      cb(Error(JSON.stringify(err)))
    }
  }else {
    console.log("commit id is not found")
    cb(Error("commit id is not found"))
  }
}