// DOMContentLoaded イベント内で実行することで、HTML要素への参照に問題が起きないようにする
document.addEventListener("DOMContentLoaded", function() {

    /****************************************************************************
     * 目的：
     *  ・キャンバス幅を倍（1600px）にし、ピン配置と受け皞を拡大する
     *  ・受け皞の深さを500pxにし、床を受け皞の底に合わせる
     *  ・パラメータ入力によりシミレーションの各パラメータを変更可能にする
     *  ・再スタートボタンでシミレーションを0から再構築する
     ****************************************************************************/

    // Matter.js の各モジュールを読み込み
    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const World = Matter.World;
    const Bodies = Matter.Bodies;
    const Events = Matter.Events;
    const Composite = Matter.Composite;

    // キャンバス設定（幅1600px, 高さ1600px）
    const canvasWidth = 1600;
    const canvasHeight = 1600;

    // グローバルパラメータ
    let params = {
        pinRadius: 10,
        colSpacing: 80,
        rowSpacing: 40,
        ballRadius: 10,
        density: 0.1,
        restitution: 0.5,
        friction: 0.01,
        frictionAir: 0.01,
        rowCount: 9,    // ピンの行数
        gravity: 1.0,    // 重力
        ballRate: 2      // 玉の生成数（秒あたり）
    };

    // 物理エンジンの作成
    let engine = Engine.create();
    engine.world.gravity.y = params.gravity; // 重力

    // レンダラーの作成：simulationContainer 内に canvas を挿入
    let render = Render.create({
        element: document.getElementById('simulationContainer'),
        engine: engine,
        options: {
            width: canvasWidth,
            height: canvasHeight,
            wireframes: false,
            background: '#fafafa'
        }
    });

    // Runner の開始
    let runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    // シミュレーション用変数
    let ballIntervalId; // 玉生成用 setInterval の ID
    let isGenerating = false; // 玉生成中かどうかのフラグ
    let ballCount = 0;  // 生成した玉の数をカウントする変数

    // -------------ピン・受け皞の配置--------------
    let bottomRowPins = [];
    let binLeftBoundary, binRightBoundary, binY;
    function setupSimulation() {
        // 以前のピン配置情報をクリア
        bottomRowPins = [];
        // シーン初期化
        World.clear(engine.world, false);

        // ピンの配置
        const rowCount = params.rowCount; 
        const startY = 60; 
        const centerX = canvasWidth / 2; 
        for (let row = 0; row < rowCount; row++) {
            let numPins = row + 1;
            let leftX = centerX - (row * (params.colSpacing / 2));
            let y = startY + row * params.rowSpacing;
            for (let i = 0; i < numPins; i++) {
                let x = leftX + i * params.colSpacing;
                let pin = Bodies.circle(x, y, params.pinRadius, {
                    isStatic: true,
                    restitution: 0.6,
                    friction: 0.01,
                    render: { 
                        fillStyle: '#ff00ff',    // マゼンタ
                        strokeStyle: '#000000',  // 黒枠
                        lineWidth: 3 
                    }
                });
                World.add(engine.world, pin);
                if (row === rowCount - 1) {
                    bottomRowPins.push(x);
                }
            }
        }

        // 受け皿の設定（ここから修正：壁のすり抜け対策）
        binY = (60 + (rowCount - 1) * params.rowSpacing) + params.rowSpacing;
        binLeftBoundary = bottomRowPins[0] - (params.colSpacing / 2);
        binRightBoundary = bottomRowPins[bottomRowPins.length - 1] + (params.colSpacing / 2);
        let binWidthTotal = binRightBoundary - binLeftBoundary;

        // 壁の厚さを定義（すり抜け防止のため極厚にする）
        let wallThickness = 100;
        let wallHeight = binY + 500;

        // 床（少し厚めにしておく）
        let floor = Bodies.rectangle(
            (binLeftBoundary + binRightBoundary) / 2,
            binY + 500 + (wallThickness / 2) - 20, 
            binWidthTotal + (wallThickness * 2), // 幅も広く
            wallThickness, 
            { isStatic: true, render: { fillStyle: '#000' } }
        );
        World.add(engine.world, floor);

        // 内側の仕切り板
        for (let i = 0; i < bottomRowPins.length - 1; i++) {
            let dividerX = (bottomRowPins[i] + bottomRowPins[i + 1]) / 2;
            let divider = Bodies.rectangle(
                dividerX,
                binY + 500 / 2,
                4,
                500,
                { isStatic: true, render: { fillStyle: '#000' } } // 真っ黒な線
            );
            World.add(engine.world, divider);
        }

        // 左右の壁（外側にずらして配置）
        let leftWall = Bodies.rectangle(
            binLeftBoundary - (wallThickness / 2), // 外へ逃がす
            wallHeight / 2,
            wallThickness,
            wallHeight,
            { 
                isStatic: true, 
                render: { 
                    fillStyle: '#222', 
                    strokeStyle: '#000', 
                    lineWidth: 4 
                } 
            }
        );
        let rightWall = Bodies.rectangle(
            binRightBoundary + (wallThickness / 2), // 外へ逃がす
            wallHeight / 2,
            wallThickness,
            wallHeight,
            { 
                isStatic: true, 
                render: { 
                    fillStyle: '#222', 
                    strokeStyle: '#000', 
                    lineWidth: 4 
                } 
            }
        );
        World.add(engine.world, leftWall);
        World.add(engine.world, rightWall);
    }
    setupSimulation();

    // --------------------------
    // 受け皞内各仕切りの玉数カウント＆棒グラフ更新
    // --------------------------
    function updateBucketCounts() {
        // bottomRowPins が昇順にソートされている前提
        if (bottomRowPins.length < 1) return;  // ピンがなければ処理しない
    
        // 境界の配列を生成
        let boundaries = [];
        // 左端境界：最初のピン位置から左に半分の間隔
        let offset = params.colSpacing / 2;
        boundaries.push(bottomRowPins[0] - offset);
    
        // 隣接ピン間の中間境界
        for (let i = 0; i < bottomRowPins.length - 1; i++) {
             boundaries.push((bottomRowPins[i] + bottomRowPins[i+1]) / 2);
        }
        // 右端境界：最後のピン位置から右に半分の間隔
        boundaries.push(bottomRowPins[bottomRowPins.length - 1] + offset);
    
        // これで境界の数 = bottomRowPins.length + 1
        // よって区間（バケット）の数 = 境界の数 - 1 = bottomRowPins.length ＝ rowCount
        console.log("boundaries:", boundaries);
    
        // 各バケットの玉数カウント
        let counts = new Array(boundaries.length - 1).fill(0);
        let bodies = Composite.allBodies(engine.world);
        bodies.forEach(body => {
            if (body.circleRadius && body.circleRadius === params.ballRadius && !body.isStatic) {
                if (body.position.y >= binY) {
                    let x = body.position.x;
                    for (let i = 0; i < counts.length; i++) {
                        // 各バケットは[boundaries[i], boundaries[i+1]) とする
                        if (x >= boundaries[i] && x < boundaries[i + 1]) {
                            counts[i]++;
                            break;
                        }
                    }
                }
            }
        });
        
        // テーブル形式（行と列を入れ替え）
        // １行目：各仕切りの番号をヘッダー（例：仕切り1, 仕切り2, …）
        // ２行目：対応する玉数
        let tableHTML = '<table border="1" style="border-collapse: collapse; font-size:16px;"><tr>';
        counts.forEach((count, idx) => {
            tableHTML += `<th>仕切り${idx + 1}</th>`;
        });
        tableHTML += '</tr><tr>';
        counts.forEach((count, idx) => {
            tableHTML += `<td>${count}個</td>`;
        });
        tableHTML += '</tr></table>';
        document.getElementById("bucketCounts").innerHTML = tableHTML;
        
        // 棒グラフ更新
        drawBarChart(counts);
        
        // 乖離（χ²）の計算と表示
        let deviation = calculateDeviation(counts);
        document.getElementById("deviationDisplay").innerText = "乖離 (χ²): " + deviation;
    }

    // --------------------------
    // 棒グラフ描画用関数
    // --------------------------
    function drawBarChart(counts) {
        let canvas = document.getElementById("barChart");
        let ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let barWidth = canvas.width / counts.length;
        let maxCount = Math.max(...counts) || 1;
        counts.forEach((count, i) => {
            let barHeight = (count / maxCount) * canvas.height;
            let x = i * barWidth;
            let y = canvas.height - barHeight;
            
            // コミック風塗り
            ctx.fillStyle = "#ffcc00"; // 黄色
            ctx.fillRect(x, y, barWidth - 2, barHeight);
            
            // 黒枠
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#000";
            ctx.strokeRect(x, y, barWidth - 2, barHeight);

            // テキスト
            ctx.font = "bold 14px 'Comic Neue', sans-serif";
            ctx.fillStyle = "#000";
            let textY = y < 20 ? y + 20 : y - 5;
            ctx.fillText(count, x + 5, textY);
        });
        drawNormalCurve(counts);
    }

    // --------------------------
    // 正規分布曲線をオーバーレイする関数
    // --------------------------
    function drawNormalCurve(counts) {
        let canvas = document.getElementById("barChart");
        let ctx = canvas.getContext("2d");
        let n = counts.length;
        // ... (中略：計算部分は変更なし) ...
        let mean = (n - 1) / 2;
        let std = n / 4;
        let pdf = [];
        let maxPdf = 0;
        for (let i = 0; i < n; i++) {
            let value = (1 / (std * Math.sqrt(2 * Math.PI))) *
                Math.exp(-Math.pow(i - mean, 2) / (2 * std * std));
            pdf.push(value);
            if (value > maxPdf) { maxPdf = value; }
        }
        let scale = canvas.height / maxPdf;
        let barWidth = canvas.width / n;
        
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            let scaledPdf = pdf[i] * scale;
            let x = i * barWidth + barWidth / 2;
            let y = canvas.height - scaledPdf;
            if (i === 0) { ctx.moveTo(x, y); }
            else { ctx.lineTo(x, y); }
        }
        
        // 描画スタイル変更
        ctx.strokeStyle = "#ff0000"; // 赤
        ctx.lineWidth = 5;           // 極太
        ctx.lineCap = "round";
        ctx.stroke();
    }

    // --------------------------
    // 玉生成用関数
    // --------------------------
    function spawnBall() {
        if (ballCount >= 200) {
            stopBallGeneration();
            return;
        }
        let enableRandomOffset = document.getElementById("enableRandomOffset").checked;
        let enableRandomVelocity = document.getElementById("enableRandomVelocity").checked;

        let randomOffsetX = enableRandomOffset ? ((Math.random() * 2) - 1) : 0;
        let spawnX = (canvasWidth / 2) + randomOffsetX;
        
        let ball = Bodies.circle(spawnX, 0, params.ballRadius, {
            density: params.density,
            restitution: params.restitution,
            friction: params.friction,
            frictionAir: params.frictionAir,
            render: { 
                fillStyle: '#00ffff',   // シアン
                strokeStyle: '#000000', // 黒枠
                lineWidth: 3 
            }
        });
        World.add(engine.world, ball);

        let randomVelocityX = enableRandomVelocity ? ((Math.random() * 2) - 1) : 0;
        Matter.Body.setVelocity(ball, { x: randomVelocityX, y: ball.velocity.y });
        ballCount++;
        document.getElementById("ballCounter").innerText = "生成した玉数 = " + ballCount + " 個";
    }

    // --------------------------
    // 玉生成の開始・停止制御
    // --------------------------
    function startBallGeneration() {
        if (isGenerating) return;
        isGenerating = true;
        // 玉生成間隔を ballRate（秒あたり）から計算（ms単位）
        let interval = 1000 / params.ballRate;
        ballIntervalId = setInterval(spawnBall, interval);
        document.getElementById("toggleButton").innerText = "Stop";
    }
    function stopBallGeneration() {
        if (!isGenerating) return;
        isGenerating = false;
        clearInterval(ballIntervalId);
        document.getElementById("toggleButton").innerText = "Start";
    }
    document.getElementById("toggleButton").addEventListener("click", function () {
        if (isGenerating) { stopBallGeneration(); }
        else { startBallGeneration(); }
    });

    // --------------------------
    // 物理エンジン更新後に各仕切りの玉数更新
    // --------------------------
    Events.on(engine, 'afterUpdate', function () {
        updateBucketCounts();
    });

    // --------------------------
    // パラメータ初期化処理（フォームの初期値設定）
    // --------------------------
    function initializeParameters() {
        // 既存パラメータ
        document.getElementById("pinRadiusInput").value = 10;
        document.getElementById("colSpacingInput").value = 80;
        document.getElementById("rowSpacingInput").value = 40;
        document.getElementById("ballRadiusInput").value = 10;
        document.getElementById("densityInput").value = 0.1;
        document.getElementById("restitutionInput").value = 0.5;
        document.getElementById("frictionInput").value = 0.01;
        document.getElementById("frictionAirInput").value = 0.01;
        document.getElementById("rowCountInput").value = 9;
        document.getElementById("gravityInput").value = 1.0;
        document.getElementById("ballRateInput").value = 2;

        // グローバルパラメータ更新
        params.pinRadius = 10;       // ピンの半径
        params.colSpacing = 80;      // ピンの列間隔
        params.rowSpacing = 40;      // ピンの行間隔
        params.ballRadius = 10;      // 玉の半径
        params.density = 0.1;        // 玉の密度
        params.restitution = 0.5;    // 玉の反発係数
        params.friction = 0.01;      // 玉の摩擦係数
        params.frictionAir = 0.01;   // 玉の空気抵抗
        params.rowCount = 9;        // ピンの行数
        params.gravity = 1.0;        // 重力
        params.ballRate = 2;         // 玉の生成数（秒あたり）
        
        // 更新：物理エンジンの重力も反映
        engine.world.gravity.y = params.gravity;
    }
    document.getElementById("resetParamsButton").addEventListener("click", function () {
        initializeParameters();  // パラメータを初期値に戻す
        restartSimulation();       // シミュレーションを再構築する
    });

    // --------------------------
    // フォームからパラメータを更新
    // --------------------------
    function updateParametersFromForm() {
        params.pinRadius   = Number(document.getElementById("pinRadiusInput").value);
        params.colSpacing  = Number(document.getElementById("colSpacingInput").value);
        params.rowSpacing  = Number(document.getElementById("rowSpacingInput").value);
        params.ballRadius  = Number(document.getElementById("ballRadiusInput").value);
        params.density     = Number(document.getElementById("densityInput").value);
        params.restitution = Number(document.getElementById("restitutionInput").value);
        params.friction    = Number(document.getElementById("frictionInput").value);
        params.frictionAir = Number(document.getElementById("frictionAirInput").value);
        // ピンの行数を固定で9にする
        params.rowCount    = 9;
        params.gravity     = Number(document.getElementById("gravityInput").value);
        params.ballRate    = Number(document.getElementById("ballRateInput").value);

        console.log("パラメータ更新:", params);
        // 物理エンジンの重力も更新
        engine.world.gravity.y = params.gravity;
    }

    // --------------------------
    // 再スタート処理（自動的にスタートしない）
    // --------------------------
    function restartSimulation() {
        stopBallGeneration();
        ballCount = 0;
        document.getElementById("ballCounter").innerText = "生成した玉数 = 0 個";
        setupSimulation();
        // startBallGeneration() を削除：Startボタンを押すまで玉生成は開始されない
    }

    // パラメータ反映ボタン（ID: restartSimulationButton）のイベントリスナー
    document.getElementById("restartSimulationButton").addEventListener("click", function () {
        updateParametersFromForm(); // フォームの値を更新
        restartSimulation();         // 新パラメータで再セットアップ（自動開始はしない）
    });

    // --------------------------
    // 乖離数値計算用関数
    // --------------------------
    // 改修後の乖離（χ²）計算用関数
    function calculateDeviation(counts) {
    // counts: 各区間の実測値（玉数）の配列
    // ここでは、理論的な期待値を正規分布に基づいて計算し、
    // その期待値と実測値との差の乖離（χ²）を求めます。

    let n = counts.length;                      // 区間（列）の数（例：13）
    let total = counts.reduce((sum, v) => sum + v, 0); // 総玉数（例：200個）
    
    // 理論的な正規分布を近似するためのパラメータ設定
    // ここでは、区間番号を 0～(n-1) とし、平均値を (n-1)/2、標準偏差を n/4 とします。
    let meanIndex = (n - 1) / 2;                 
    let sigma = n / 4;
    
    // 各区間 i における正規分布の確率密度関数（PDF）の値を計算する
    // PDF(i) = (1 / (sigma * √(2π))) * exp(-((i - meanIndex)² / (2σ²)))
    let pdfValues = [];
    for (let i = 0; i < n; i++) {
        let pdf = 1 / (sigma * Math.sqrt(2 * Math.PI)) * Math.exp(-Math.pow(i - meanIndex, 2) / (2 * sigma * sigma));
        pdfValues.push(pdf);
    }
    
    // PDF値の合計を求め、正規化のために使用
    let sumPdf = pdfValues.reduce((sum, v) => sum + v, 0);
    
    // 各区間の期待値（理論値）を、総玉数に対するPDF値の比率から求める
    // expected[i] = total * (pdfValues[i] / sumPdf)
    let expected = pdfValues.map(v => total * v / sumPdf);
    
    // 各区間ごとに、乖離（χ²）の計算を行う
    // (実測値 - 期待値)² / 期待値 を全区間で合計
    let chiSquare = counts.reduce((sum, observed, i) => {
        return sum + Math.pow(observed - expected[i], 2) / expected[i];
    }, 0);
    
    // 計算結果を小数点以下2桁で返す
    return chiSquare.toFixed(2);
}

    // 初期化処理
    initializeParameters();

});