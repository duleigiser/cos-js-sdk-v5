var util = {
    createFile: function (options) {
        var buffer = new ArrayBuffer(options.size || 0);
        var arr = new Uint8Array(buffer);
        arr.forEach(function (char, i) {
            arr[i] = 0;
        });
        var opt = {};
        options.type && (opt.type = options.type);
        var blob = new Blob([buffer], options);
        return blob;
    },
    str2blob: function (str) {
        var size = str.length;
        var buffer = new ArrayBuffer(size || 0);
        var arr = new Uint8Array(buffer);
        arr.forEach(function (char, i) {
            arr[i] = str[i];
        });
        var blob = new Blob([buffer]);
        return blob;
    }
};

var getAuthorization = function (options, callback) {

    // 方法一（推荐）
    var method = (options.method || 'get').toLowerCase();
    var pathname = options.pathname || '/';
    var url = '../server/auth.php?method=' + method + '&pathname=' + pathname;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function (e) {
        callback(e.target.responseText);
    };
    xhr.send();

    // // 方法二（适用于前端调试）
    // var authorization = COS.getAuthorization({
    //     SecretId: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    //     SecretKey: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    //     method: (options.method || 'get').toLowerCase(),
    //     pathname: options.pathname || '/',
    // });
    // callback(authorization);

};

var cos = new COS({
    // 必选参数
    AppId: config.AppId,
    getAuthorization: getAuthorization,
    // 可选参数
    FileParallelLimit: 3,    // 控制文件上传并发数
    ChunkParallelLimit: 3,   // 控制单个文件下分片上传并发数
    ChunkSize: 1024 * 1024,  // 控制分片大小，单位 B
    ProgressInterval: 1000,  // 控制 onProgress 回调的间隔
    Domain: '{{Bucket}}-{{AppId}}.{{Region}}.myqcloud.com',  // 自定义域名
});

var AppId = config.AppId;
var Bucket = config.Bucket;
var TaskId;

function prepareBucket() {
    return new Promise(function (resolve, reject) {
        cos.putBucket({
            Bucket: config.Bucket,
            Region: config.Region
        }, function (err, data) {
            resolve();
        });
    });
}

function prepareBigObject() {
    return new Promise(function (resolve, reject) {
        // 创建测试文件
        var filename = 'big.zip';
        var filepath = path.resolve(__dirname, filename);
        var put = function () {
            // 调用方法
            cos.putObject({
                Bucket: config.Bucket,
                Region: config.Region,
                Key: filename,
                Body: fs.createReadStream(filepath),
                ContentLength: fs.statSync(filepath).size,
            }, function (err, data) {
                err ? reject(err) : resolve()
            });
        };
        if (fs.existsSync(filepath)) {
            put();
        } else {
            util.createFile(filepath, 1024 * 1024 * 10);
            put();
        }
    });
}

function comparePlainObject(a, b) {
    if (Object.keys(a).length !== Object.keys(b).length) {
        return false;
    }
    for (var key in a) {
        if (typeof a[key] === 'object' && typeof b[key] === 'object') {
            if (!comparePlainObject(a[key], b[key])) {
                return false;
            }
        } else if (a[key] != b[key]) {
            return false;
        }
    }
    return true;
}

// QUnit.test('getAuth()', function (assert) {
//     return new Promise(function (resolve, reject) {
//         var content = Date.now().toString();
//         var key = '1.txt';
//         prepareBucket().then(function () {
//             cos.putObject({
//                 Bucket: config.Bucket,
//                 Region: config.Region,
//                 Key: key,
//                 Body: util.createFile({size: 10})
//             }, function (err, data) {
//                 getAuthorization({
//                     method: 'get',
//                     pathname: '/' + key
//                 }, function (auth) {
//                     var link = 'http://' + Bucket + '-' + AppId + '.cos.' + config.Region + '.myqcloud.com/' + key;
//                     $.ajax({
//                         url: link,
//                         beforeSend: function (xhr) {
//                             xhr.setRequestHeader('Authorization', auth)
//                         },
//                         success: function (err, response, body) {
//                             assert.ok(response.statusCode === 200);
//                             assert.ok(body === content, '通过获取签名能正常获取文件');
//                             resolve("result");
//                         }
//                     });
//                 });
//             });
//         }).catch(function () {
//         });
//     });
// });

QUnit.test('getBucket()', function (assert) {
    return new Promise(function (resolve, reject) {
        prepareBucket().then(function () {
            cos.getBucket({
                Bucket: config.Bucket,
                Region: config.Region
            }, function (err, data) {
                assert.equal(true, data.Name === Bucket || data.Name === Bucket + '-' + config.AppId, '能列出 bucket');
                assert.equal(data.Contents.constructor, Array, '正常获取 bucket 里的文件列表');
                resolve();
            });
        }).catch(function () {
        });
    });
});

QUnit.test('putObject()', function (assert) {
    var filename = '1.txt';
    var getObjectETag = function (callback) {
        setTimeout(function () {
            cos.headObject({
                Bucket: config.Bucket,
                Region: config.Region,
                Key: filename,
            }, function (err, data) {
                callback(data && data.headers && data.headers.etag);
            });
        }, 2000);
    };
    return new Promise(function (done) {
        var content = Date.now().toString();
        var lastPercent = 0;
        var blob = util.str2blob(content);
        cos.putObject({
            Bucket: config.Bucket,
            Region: config.Region,
            Key: filename,
            Body: blob,
            onProgress: function (processData) {
                lastPercent = processData.percent;
            },
        }, function (err, data) {
            if (err) throw err;
            assert.ok(data.ETag.length > 0, 'putObject 有返回 ETag');
            getObjectETag(function (ETag) {
                assert.ok(data.ETag === ETag, 'Blob 创建 object');
                done();
            });
        });
    });
});

// QUnit.test('getObject()', function (assert) {
//     new Promise(function (done) {
//         var key = '1.txt';
//         var objectContent = util.str2blob([]);
//         var outputStream = new Writable({
//             write: function (chunk, encoding, callback) {
//                 objectContent = Buffer.concat([objectContent, chunk]);
//             }
//         });
//         var content = Date.now().toString(36);
//         cos.putObject({
//             Bucket: config.Bucket,
//             Region: config.Region,
//             Key: key,
//             Body: util.str2blob(content)
//         }, function (err, data) {
//             setTimeout(function () {
//                 cos.getObject({
//                     Bucket: config.Bucket,
//                     Region: config.Region,
//                     Key: key,
//                     Output: outputStream
//                 }, function (err, data) {
//                     if (err) throw err;
//                     objectContent = objectContent.toString();
//                     assert.ok(data.headers['content-length'] === '' + content.length);
//                     assert.ok(objectContent === content);
//                     done();
//                 });
//             }, 2000);
//         });
//     });
//     new Promise(function (done) {
//         var key = '1.txt';
//         var content = Date.now().toString();
//         cos.putObject({
//             Bucket: config.Bucket,
//             Region: config.Region,
//             Key: key,
//             Body: util.str2blob(content)
//         }, function (err, data) {
//             setTimeout(function () {
//                 cos.getObject({
//                     Bucket: config.Bucket,
//                     Region: config.Region,
//                     Key: key
//                 }, function (err, data) {
//                     if (err) throw err;
//                     var objectContent = data.Body.toString();
//                     assert.ok(data.headers['content-length'] === '' + content.length);
//                     assert.ok(objectContent === content);
//                     done();
//                 });
//             }, 2000);
//         });
//     });
// });

QUnit.test('sliceUploadFile()', function (assert) {
    return new Promise(function (done) {
        var filename = '3mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        var lastPercent = 0;
        cos.sliceUploadFile({
            Bucket: config.Bucket,
            Region: config.Region,
            Key: filename,
            Body: blob,
            SliceSize: 1024 * 1024,
            AsyncLimit: 5,
            onHashProgress: function (progressData) {
            },
            onProgress: function (progressData) {
                lastPercent = progressData.percent;
            },
        }, function (err, data) {
            assert.ok(data.ETag.length > 0 && lastPercent === 1, '上传成功');
            done();
        });
    });
});

(function () {
    var AccessControlPolicy = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grants": [{
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }]
    };
    var AccessControlPolicy2 = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grant": {
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }
    };
    QUnit.test('putBucketAcl() header ACL:private', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                ACL: 'private'
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 1, '正常返回有一条权限');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header ACL:public-read', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                ACL: 'public-read',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置权限 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置权限 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header ACL:public-read-write', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                ACL: 'public-read-write',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置权限 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'FULL_CONTROL', '设置权限 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header GrantRead:1001,1002"', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantRead: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'READ', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header GrantWrite:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantWrite: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'WRITE', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'WRITE', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantFullControl: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'FULL_CONTROL', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'FULL_CONTROL', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() header ACL:public-read, GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantFullControl: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
                ACL: 'public-read',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 3);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置 ACL ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置 ACL Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'FULL_CONTROL', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[2].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[2].Permission === 'FULL_CONTROL', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() xml', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', '设置 AccessControlPolicy ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置 AccessControlPolicy Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() xml2', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy2
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002');
                    assert.ok(data.Grants[0].Permission === 'READ');
                    done();
                });
            });
        });
    });
})();

(function (assert) {
    var AccessControlPolicy = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grants": [{
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }]
    };
    var AccessControlPolicy2 = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grant": {
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }
    };
    QUnit.test('putObjectAcl() header ACL:private', function (assert) {
        return new Promise(function (done) {
            cos.putObject({
                Bucket: config.Bucket,
                Region: config.Region,
                Key: '1.txt',
                Body: util.str2blob('hello!'),
            }, function (err, data) {
                assert.ok(!err);
                cos.putObjectAcl({
                    Bucket: config.Bucket,
                    Region: config.Region,
                    ACL: 'private',
                    Key: '1mb.zip',
                }, function (err, data) {
                    assert.ok(!err, 'putObjectAcl 成功');
                    cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                        assert.ok(data.Grants.length === 1);
                        done();
                    });
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header ACL:public-read', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                ACL: 'public-read',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置权限 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置权限 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header ACL:public-read-write', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                ACL: 'public-read-write',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置权限 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'FULL_CONTROL', '设置权限 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header GrantRead:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantRead: 'id="qcs::cam::uin/1001:uin/1001",id="qcs::cam::uin/1002:uin/1002"',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'READ', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header GrantWrite:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantWrite: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'WRITE', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'WRITE', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantFullControl: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 2);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[0].Permission === 'FULL_CONTROL', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'FULL_CONTROL', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() header ACL:public-read, GrantRead:1001,1002', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                GrantFullControl: 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"',
                ACL: 'public-read',
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 3);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::anyone:anyone', '设置 ACL ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置 ACL Permission 正确');
                    assert.ok(data.Grants[1].Grantee.ID === 'qcs::cam::uin/1001:uin/1001', '设置权限第一个 ID 正确');
                    assert.ok(data.Grants[1].Permission === 'FULL_CONTROL', '设置权限第一个 Permission 正确');
                    assert.ok(data.Grants[2].Grantee.ID === 'qcs::cam::uin/1002:uin/1002', '设置权限第二个 ID 正确');
                    assert.ok(data.Grants[2].Permission === 'FULL_CONTROL', '设置权限第二个 Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putObjectAcl() xml', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy,
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', '设置 AccessControlPolicy ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', '设置 AccessControlPolicy Permission 正确');
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketAcl() xml2', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket,
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy2,
                Key: '1mb.zip',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region, Key: '1mb.zip'}, function (err, data) {
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', 'ID 正确');
                    assert.ok(data.Grants[0].Permission === 'READ', 'Permission 正确');
                    done();
                });
            });
        });
    });
})();

(function (assert) {
    var CORSRules = [{
        "AllowedOrigins": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": [
            "origin",
            "accept",
            "content-type",
            "authorization",
            "content-md5",
            "x-cos-copy-source",
            "x-cos-acl",
            "x-cos-grant-read",
            "x-cos-grant-write",
            "x-cos-grant-full-control",
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }];
    var CORSRules1 = [{
        "AllowedOrigin": "*",
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeader": [
            "origin",
            "accept",
            "content-type",
            "authorization",
            "content-md5",
            "x-cos-copy-source",
            "x-cos-acl",
            "x-cos-grant-read",
            "x-cos-grant-write",
            "x-cos-grant-full-control",
        ],
        "ExposeHeader": "ETag",
        "MaxAgeSeconds": "5"
    }];
    var CORSRulesMulti = [{
        "AllowedOrigins": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": [
            "origin",
            "accept",
            "content-type",
            "authorization",
            "content-md5",
            "x-cos-copy-source",
            "x-cos-acl",
            "x-cos-grant-read",
            "x-cos-grant-write",
            "x-cos-grant-full-control",
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }, {
        "AllowedOrigins": ["http://qq.com", "http://qcloud.com"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": [
            "origin",
            "accept",
            "content-type",
            "authorization",
            "content-md5",
            "x-cos-copy-source",
            "x-cos-acl",
            "x-cos-grant-read",
            "x-cos-grant-write",
            "x-cos-grant-full-control",
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }];
    QUnit.test('putBucketCors(),getBucketCors()', function (assert) {
        return new Promise(function (done) {
            CORSRules[0].AllowedHeaders[CORSRules[0].AllowedHeaders.length - 1] =
                'test-' + Date.now().toString(36);
            cos.putBucketCors({
                Bucket: config.Bucket,
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRules
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRules, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    QUnit.test('putBucketCors() old', function (assert) {
        return new Promise(function (done) {
            CORSRules[0].AllowedHeaders[CORSRules[0].AllowedHeaders.length - 1] =
                CORSRules1[0].AllowedHeader[CORSRules1[0].AllowedHeader.length - 1] =
                    'test-' + Date.now().toString(36);
            cos.putBucketCors({
                Bucket: config.Bucket,
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRules1
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRules, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    QUnit.test('putBucketCors() old', function (assert) {
        return new Promise(function (done) {
            CORSRules[0].AllowedHeaders[CORSRules[0].AllowedHeaders.length - 1] =
                'test-' + Date.now().toString(36);
            cos.putBucketCors({
                Bucket: config.Bucket,
                Region: config.Region,
                CORSRules: CORSRules
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRules, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    QUnit.test('putBucketCors() multi', function (assert) {
        return new Promise(function (done) {
            cos.putBucketCors({
                Bucket: config.Bucket,
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRulesMulti
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRulesMulti, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
})();

(function () {
    var Tags = [
        {Key: "k1", Value: "v1"}
    ];
    var TagsMulti = [
        {Key: "k1", Value: "v1"},
        {Key: "k2", Value: "v2"},
    ];
    QUnit.test('putBucketTagging(),getBucketTagging()', function (assert) {
        return new Promise(function (done) {
            Tags[0].Value = Date.now().toString(36);
            cos.putBucketTagging({
                Bucket: config.Bucket,
                Region: config.Region,
                Tagging: {
                    Tags: Tags
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(Tags, data.Tags));
                        done();
                    });
                }, 1000);
            });
        });
    });
    QUnit.test('deleteBucketTagging()', function (assert) {
        return new Promise(function (done) {
            cos.deleteBucketTagging({
                Bucket: config.Bucket,
                Region: config.Region
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject([], data.Tags));
                        done();
                    });
                }, 1000);
            });
        });
    });
    QUnit.test('putBucketTagging() multi', function (assert) {
        return new Promise(function (done) {
            Tags[0].Value = Date.now().toString(36);
            cos.putBucketTagging({
                Bucket: config.Bucket,
                Region: config.Region,
                Tagging: {
                    Tags: TagsMulti
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket,
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(TagsMulti, data.Tags));
                        done();
                    });
                }, 2000);
            });
        });
    });
})();

(function (assert) {
    var Prefix = Date.now().toString(36);
    var Policy = {
        "version": "2.0",
        "principal": {"qcs": ["qcs::cam::uin/10001:uin/10001"]}, // 这里的 10001 是 QQ 号
        "statement": [{
            "effect": "allow",
            "action": [
                "name/cos:GetBucket",
                "name/cos:PutObject",
                "name/cos:PostObject",
                "name/cos:PutObjectCopy",
                "name/cos:InitiateMultipartUpload",
                "name/cos:UploadPart",
                "name/cos:UploadPartCopy",
                "name/cos:CompleteMultipartUpload",
                "name/cos:AbortMultipartUpload",
                "name/cos:AppendObject"
            ],
            "resource": ["qcs::cos:" + config.Region + ":uid/" + AppId + ":" + Bucket + "-" + AppId + "." + config.Region + ".myqcloud.com//" + AppId + "/" + Bucket + "/" + Prefix + "/*"] // 1250000000 是 appid
        }]
    };
    QUnit.test('putBucketPolicy(),getBucketPolicy()', function (assert) {
        return new Promise(function (done) {
            cos.putBucketPolicy({
                Bucket: config.Bucket,
                Region: config.Region,
                Policy: Policy
            }, function (err, data) {
                assert.ok(!err);
                cos.getBucketPolicy({
                    Bucket: config.Bucket,
                    Region: config.Region
                }, function (err, data) {
                    assert.ok(Policy, data.Policy);
                    done();
                });
            });
        });
    });
    QUnit.test('putBucketPolicy() s3', function (assert) {
        return new Promise(function (done) {
            cos.putBucketPolicy({
                Bucket: config.Bucket,
                Region: config.Region,
                Policy: JSON.stringify(Policy)
            }, function (err, data) {
                assert.ok(!err);
                cos.getBucketPolicy({
                    Bucket: config.Bucket,
                    Region: config.Region
                }, function (err, data) {
                    assert.ok(Policy, data.Policy);
                    done();
                });
            });
        });
    });
})();

QUnit.test('getBucketLocation()', function (assert) {
    return new Promise(function (done) {
        cos.getBucketLocation({
            Bucket: config.Bucket,
            Region: config.Region
        }, function (err, data) {
            assert.ok(data.LocationConstraint === config.Region);
            done();
        });
    });
});

// (function (assert) {
//     var Rules = [{
//         'Filter': {
//             'Prefix': 'test_' + Date.now().toString(36),
//         },
//         'Status': 'Enabled',
//         'Transition': {
//             'Date': '2018-07-30T00:00:00+08:00',
//             'StorageClass': 'Standard_IA'
//         }
//     }];
//     var RulesMulti = [{
//         'Filter': {
//             'Prefix': 'test_' + Date.now().toString(36),
//         },
//         'Status': 'Enabled',
//         'Transition': {
//             'Date': '2018-07-30T00:00:00+08:00',
//             'StorageClass': 'Standard_IA'
//         }
//     }, {
//         'Filter': {
//             'Prefix': 'test',
//         },
//         'Status': 'Enabled',
//         'Transition': {
//             'Days': '0',
//             'StorageClass': 'Nearline'
//         }
//     }];
//     QUnit.test('deleteBucketLifecycle()', function (assert) {
//         return new Promise(function (done) {
//             cos.deleteBucketLifecycle({
//                 Bucket: config.Bucket,
//                 Region: config.Region
//             }, function (err, data) {
//                 assert.ok(!err);
//                 setTimeout(function () {
//                     cos.getBucketLifecycle({
//                         Bucket: config.Bucket,
//                         Region: config.Region
//                     }, function (err, data) {
//                         assert.ok(err.statusCode === 404);
//                         assert.ok(err.error.Code === 'NoSuchLifecycleConfiguration');
//                         done();
//                     });
//                 }, 2000);
//             });
//         });
//     });
//     QUnit.test('putBucketLifecycle(),getBucketLifecycle()', function (assert) {
//         return new Promise(function (done) {
//             Rules[0].Filter.Prefix = 'test_' + Date.now().toString(36);
//             cos.putBucketLifecycle({
//                 Bucket: config.Bucket,
//                 Region: config.Region,
//                 LifecycleConfiguration: {
//                     Rules: Rules
//                 }
//             }, function (err, data) {
//                 assert.ok(!err);
//                 setTimeout(function () {
//                     cos.getBucketLifecycle({
//                         Bucket: config.Bucket,
//                         Region: config.Region
//                     }, function (err, data) {
//                         assert.ok(comparePlainObject(Rules, data.Rules));
//                         done();
//                     });
//                 }, 2000);
//             });
//         });
//     });
//     QUnit.test('putBucketLifecycle() multi', function (assert) {
//         return new Promise(function (done) {
//             Rules[0].Filter.Prefix = 'test_' + Date.now().toString(36);
//             cos.putBucketLifecycle({
//                 Bucket: config.Bucket,
//                 Region: config.Region,
//                 LifecycleConfiguration: {
//                     Rules: RulesMulti
//                 }
//             }, function (err, data) {
//                 assert.ok(!err);
//                 setTimeout(function () {
//                     cos.getBucketLifecycle({
//                         Bucket: config.Bucket,
//                         Region: config.Region
//                     }, function (err, data) {
//                         assert.ok(comparePlainObject(RulesMulti, data.Rules));
//                         done();
//                     });
//                 }, 2000);
//             });
//         });
//     });
// })();

QUnit.test('params check', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket,
            Region: 'gz'
        }, function (err, data) {
            assert.ok(err.error === 'Region should be cn-south');
            done();
        });
    });
});

QUnit.test('params check', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket,
            Region: 'cos.cn-south'
        }, function (err, data) {
            assert.ok(err.error === 'Region should not be start with "cos."');
            done();
        });
    });
});