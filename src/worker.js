onmessage = (e) => {
    console.log("Message received from main script");
    const ar = new Int32Array(e.data);
    console.log(ar[0]);
    setInterval(() => {
    for (let i = 0; i < 1024 / 4;i ++)
        ar[i] = Math.random() * 100;
    }, 100);
    
  };